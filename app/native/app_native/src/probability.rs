use core::cmp::Ordering;
use std::collections::BinaryHeap;

pub trait ReservoirSample {
    type Item;

    /// Takes an unweighted sample from the source. The elements are returned in
    /// arbitrary order, unless stated otherwise.
    fn sample(&mut self, count: usize) -> Vec<Self::Item>;

    /// Takes a weighted sample from the source. The weight function must always
    /// return a non-negative finite float. The elements are returned in arbitrary
    /// order, unless stated otherwise.
    fn sample_weighted<F>(&mut self, count: usize, weight_fun: F) -> Vec<Self::Item>
    where
        F: Fn(&Self::Item) -> f64;
}

#[derive(Clone, Copy)]
struct FloatWith<T>(f64, T);

impl<T> PartialEq for FloatWith<T> {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl<T> Eq for FloatWith<T> {}

impl<T> PartialOrd for FloatWith<T> {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        self.0.partial_cmp(&other.0)
    }
}

impl<T> Ord for FloatWith<T> {
    fn cmp(&self, other: &Self) -> Ordering {
        self.0.partial_cmp(&other.0).unwrap_or(Ordering::Equal)
    }
}

impl<I, E> ReservoirSample for I
where
    I: Iterator<Item = E>,
{
    type Item = E;

    fn sample(&mut self, count: usize) -> Vec<Self::Item> {
        // https://richardstartin.github.io/posts/reservoir-sampling#algorithm-l
        let mut res = vec![];
        while res.len() < count {
            if let Some(v) = self.next() {
                res.push(v);
            } else {
                return res;
            }
        }

        let invcount = 1.0 / (count as f64);
        let mut w = rand::random::<f64>().powf(invcount);
        loop {
            let jump_len = f64::ln(rand::random()) / f64::ln(1.0 - w);
            // Safety: random and 1-w are in [0, 1), both args to the product are negative
            let jump_len: usize = unsafe { jump_len.to_int_unchecked() };
            for _ in 0..jump_len {
                if matches!(self.next(), None) {
                    return res;
                }
            }
            let Some(v) = self.next() else {
                return res;
            };
            // Safety: random is never NaN or infinite, and both args to the product are non-negative
            let replace_idx: usize = unsafe { (rand::random::<f64>() * (count as f64)).to_int_unchecked() };
            res[replace_idx] = v;

            w *= rand::random::<f64>().powf(invcount);
        }
    }

    fn sample_weighted<F>(&mut self, count: usize, weight_fun: F) -> Vec<Self::Item>
    where
        F: Fn(&Self::Item) -> f64,
    {
        if count == 0 {
            return vec![];
        }

        // https://en.wikipedia.org/wiki/Reservoir_sampling#Algorithm_A-Res
        let mut heap = BinaryHeap::new();
        while heap.len() < count {
            if let Some(v) = self.next() {
                let k = -f64::ln(rand::random()) / weight_fun(&v);
                heap.push(FloatWith(k, v));
            } else {
                return heap.into_iter().map(|pair| pair.1).collect();
            }
        }
        for v in self {
            let k = -f64::ln(rand::random()) / weight_fun(&v);
            if k < heap.peek().unwrap().0 {
                let _ = heap.pop().unwrap();
                heap.push(FloatWith(k, v));
            }
        }
        heap.into_iter().map(|pair| pair.1).collect()
    }
}

/// A sampling mechanism designed as a binary search tree over subintervals of
/// [0, total). Construction is *O*(*n*), and taking a sample of size *k* is *O*(*k log n*).
///
/// The tree automatically samples without replacement until reset() is called.
/// It is not possible to insert or delete an element from the distribution
/// after constructing the tree.
#[derive(Debug)]
pub struct SampleTree<T: Copy> {
    data: Vec<SampleNode<T>>,
    total: f64,
    frozen_data: Vec<SampleNode<T>>,
    frozen_total: f64,
}

impl<T: Copy> SampleTree<T> {
    pub fn new<I>(initial: I) -> Self
    where
        I: IntoIterator<Item = (f64, T)>,
    {
        let data = vec![];
        let (total, mut data) = initial
            .into_iter()
            .map(|(w, k)| SampleNode::new(w, k, [0.0; B - 1]))
            .fold((0.0, data), |(x, mut a), node| {
                a.push(node);
                (x + node.weight, a)
            });
        if data.len() > 0 {
            let _ = Self::set_left_weight(&mut data, 0);
        }
        let frozen_data = data.clone();
        Self {
            data,
            total,
            frozen_data,
            frozen_total: total,
        }
    }

    fn set_left_weight<K: Copy>(data: &mut Vec<SampleNode<K>>, index: usize) -> f64 {
        let first_child_index = index * B + 1;
        if first_child_index >= data.len() {
            return data[index].weight;
        }
        let mut total = data[index].weight;
        let mut subweights = data[index].subweights.clone();
        for which in 0..B {
            let child_index = first_child_index + which;
            if child_index >= data.len() {
                break;
            }
            let child_weight = Self::set_left_weight(data, child_index);
            total += child_weight;
            if which < B - 1 {
                subweights[which] = child_weight;
            }
        }
        data[index].subweights = subweights;
        total
    }

    pub fn sample(&mut self) -> Option<T> {
        if self.total == 0.0 {
            return None;
        }
        let mut rand_weight = rand::random::<f64>() * self.total;
        let mut index = 0;
        while index < self.data.len() {
            let node = self.data[index];
            rand_weight -= node.weight;
            if rand_weight <= 0.0 {
                self.set(index, 0.0);
                return Some(node.key);
            }
            let mut index_next = B * index + B;
            for which in 0..B - 1 {
                if rand_weight <= node.subweights[which] {
                    index_next = B * index + which + 1;
                    break;
                } else {
                    rand_weight -= node.subweights[which];
                }
            }
            index = index_next;
        }
        None
    }

    pub fn reset(&mut self) {
        self.data = self.frozen_data.clone();
        self.total = self.frozen_total;
    }

    fn set(&mut self, index: usize, new_weight: f64) {
        let delta = new_weight - self.data[index].weight;
        self.data[index].weight = new_weight;
        let mut curr = index;
        while curr > 0 {
            let which = (curr - 1) % B;
            curr = (curr - 1) / B;
            if which < B - 1 {
                self.data[curr].subweights[which] += delta;
            }
        }
        self.total += delta;
    }
}

const B: usize = 4;

#[derive(Debug, Clone, Copy, PartialEq)]
struct SampleNode<T: Copy> {
    weight: f64,
    key: T,
    subweights: [f64; B - 1],
}

impl<T: Copy> SampleNode<T> {
    fn new(weight: f64, key: T, subweights: [f64; B - 1]) -> Self {
        Self {
            weight,
            key,
            subweights,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{ReservoirSample, SampleNode, SampleTree};

    #[test]
    fn test_sample() {
        let data = vec![1, 2, 3, 4];
        let mut counts = HashMap::new();
        for _ in 0..6000 {
            let sample = data.clone().into_iter().sample(2);
            assert_eq!(sample.len(), 2);
            let sk = sample[0].min(sample[1]) * 10 + sample[0].max(sample[1]);
            let ct = counts.entry(sk).or_insert(0u32);
            *ct += 1;
        }
        let p = 1.0 / 6.0;
        for (i, a) in data.iter().copied().enumerate() {
            for b in data.iter().skip(i + 1).copied() {
                let sk = a * 10 + b;
                let variance: f64 = 6000.0 * p * (1.0 - p);
                let actual = *counts.get(&sk).unwrap_or(&0);
                let min = 6000.0 * p - 6.0 * variance.sqrt();
                let max = 6000.0 * p + 6.0 * variance.sqrt();
                assert!(
                    min < actual as f64 && (actual as f64) < max,
                    "{:?} < counts[{:?}] = {:?} < {:?}",
                    min,
                    sk,
                    actual,
                    max
                );
            }
        }
    }

    #[test]
    fn test_sample_weighted() {
        let data = vec![1, 2, 3];
        let mut counts = HashMap::new();
        for _ in 0..6000 {
            let sample = data.clone().into_iter().sample_weighted(2, |x| *x as f64);
            assert_eq!(sample.len(), 2);
            let sk = sample[0].min(sample[1]) * 10 + sample[0].max(sample[1]);
            let ct = counts.entry(sk).or_insert(0u32);
            *ct += 1;
        }
        for (i, a) in data.iter().copied().enumerate() {
            for b in data.iter().skip(i + 1).copied() {
                let sk = a * 10 + b;
                let aw = a as f64;
                let bw = b as f64;
                let p = (aw / 6.0 * bw / (6.0 - aw)) + (bw / 6.0 * aw / (6.0 - bw));
                let variance = 6000.0 * p * (1.0 - p);
                let actual = *counts.get(&sk).unwrap();
                let min = 6000.0 * p - 6.0 * variance.sqrt();
                let max = 6000.0 * p + 6.0 * variance.sqrt();
                assert!(
                    min < actual as f64 && (actual as f64) < max,
                    "{:?} < counts[{:?}] = {:?} < {:?}",
                    min,
                    sk,
                    actual,
                    max
                );
            }
        }
    }

    #[test]
    fn test_sample_tree() {
        let mut tree0: SampleTree<i32> = SampleTree::new([]);
        assert_eq!(tree0.sample(), None);

        let mut tree1 = SampleTree::new([(0.5, 1)]);
        assert_eq!(tree1.total, 0.5);
        assert_eq!(tree1.data, vec![SampleNode::new(0.5, 1, [0.0; 3])]);
        assert_eq!(tree1.sample(), Some(1));
        assert_eq!(tree1.data, vec![SampleNode::new(0.0, 1, [0.0; 3])]);
        assert_eq!(tree1.total, 0.0);
        assert_eq!(tree1.sample(), None);
        tree1.reset();
        assert_eq!(tree1.total, 0.5);
        assert_eq!(tree1.data, vec![SampleNode::new(0.5, 1, [0.0; 3])]);

        let mut tree6 =
            SampleTree::new([(0.5, 1), (0.5, 2), (0.5, 3), (0.5, 4), (0.5, 5), (0.5, 6)]);
        assert_eq!(tree6.total, 3.0);
        assert_eq!(
            tree6.data,
            vec![
                SampleNode::new(0.5, 1, [1.0, 0.5, 0.5]),
                SampleNode::new(0.5, 2, [0.5, 0.0, 0.0]), // parent=1
                SampleNode::new(0.5, 3, [0.0; 3]),        // parent=1
                SampleNode::new(0.5, 4, [0.0; 3]),        // parent=1
                SampleNode::new(0.5, 5, [0.0; 3]),        // parent=1
                SampleNode::new(0.5, 6, [0.0; 3]),        // parent=2
            ]
        );
        let mut tree6_sample = std::iter::from_fn(|| tree6.sample()).collect::<Vec<_>>();
        tree6_sample.sort();
        assert_eq!(tree6_sample, [1, 2, 3, 4, 5, 6]);
        assert_eq!(tree6.total, 0.0);
        assert_eq!(tree6.sample(), None);
        tree6.reset();
        assert_eq!(tree6.total, 3.0);
    }
}
