use core::cmp::Ordering;
use std::collections::BinaryHeap;

pub trait ReservoirSample {
    type Item;

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
/// The tree automatically samples without replacement, and replacing *k* samples is also
/// *O*(*k log n*). It is not possible to insert or delete an element from the distribution
/// after constructing the tree.
#[derive(Debug)]
pub struct SampleTree<T: Copy> {
    data: Vec<SampleNode<T>>,
    pending: Vec<(usize, f64)>,
    total: f64,
}

impl<T: Copy> SampleTree<T> {
    pub fn new<I>(initial: I) -> Self
    where
        I: IntoIterator<Item = (f64, T)>,
    {
        let data = vec![];
        let (total, mut data) = initial
            .into_iter()
            .map(|(w, k)| SampleNode::new(0.0, w, k))
            .fold((0.0, data), |(x, mut a), node| {
                a.push(node);
                (x + node.mid_weight, a)
            });
        if data.len() > 0 {
            let _ = Self::set_left_weight(&mut data, 0);
        }
        Self {
            data,
            pending: vec![],
            total,
        }
    }

    fn set_left_weight<K: Copy>(data: &mut Vec<SampleNode<K>>, index: usize) -> f64 {
        let left_child_idx = index * 2 + 1;
        let right_child_idx = index * 2 + 2;
        let (left_total, res) = if right_child_idx < data.len() {
            let lsubw = Self::set_left_weight(data, left_child_idx);
            let rsubw = Self::set_left_weight(data, right_child_idx);
            (lsubw, data[index].mid_weight + lsubw + rsubw)
        } else if left_child_idx < data.len() {
            // can't have another row if right child is first blank
            let lcw = data[left_child_idx].mid_weight;
            (lcw, data[index].mid_weight + lcw)
        } else {
            (0.0, data[index].mid_weight)
        };
        data[index] = data[index].change_left_weight(left_total);
        res
    }

    pub fn sample(&mut self) -> Option<T> {
        let mut w = rand::random::<f64>() * self.total;
        let mut index = 0;
        while index < self.data.len() {
            let node = self.data[index];
            if w < node.left_weight {
                index = 2 * index + 1;
            } else if w < node.left_weight + node.mid_weight {
                self.set(index, 0.0);
                self.pending.push((index, node.mid_weight));
                return Some(node.key);
            } else {
                index = 2 * index + 2;
                w -= node.left_weight + node.mid_weight;
            }
        }
        None
    }

    pub fn reset(&mut self) {
        let lst: Vec<_> = self.pending.drain(..).collect();
        for (index, new_weight) in lst {
            self.set(index, new_weight);
        }
    }

    fn set(&mut self, index: usize, new_weight: f64) {
        let delta = new_weight - self.data[index].mid_weight;
        self.data[index] = self.data[index].replace_mid_weight(new_weight);
        let mut curr = index;
        while curr > 0 {
            let is_left_child = curr % 2 == 1;
            curr = (curr - 1) / 2;
            if is_left_child {
                self.data[curr] = self.data[curr].change_left_weight(delta);
            }
        }
        self.total += delta;
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
struct SampleNode<T: Copy> {
    left_weight: f64,
    mid_weight: f64,
    key: T,
}

impl<T: Copy> SampleNode<T> {
    fn new(left_weight: f64, mid_weight: f64, key: T) -> Self {
        Self {
            left_weight,
            mid_weight,
            key,
        }
    }

    fn change_left_weight(self, delta: f64) -> Self {
        Self::new(self.left_weight + delta, self.mid_weight, self.key)
    }

    fn replace_mid_weight(self, new_mid_weight: f64) -> Self {
        Self::new(self.left_weight, new_mid_weight, self.key)
    }
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;

    use super::{ReservoirSample, SampleNode, SampleTree};

    #[test]
    fn test_reservoir_sample() {
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
                assert!(min < actual as f64 && (actual as f64) < max, "{:?} < counts[{:?}] = {:?} < {:?}", min, sk, actual, max);
            }
        }
    }

    #[test]
    fn test_sample_tree() {
        let mut tree0: SampleTree<i32> = SampleTree::new([]);
        assert_eq!(tree0.sample(), None);

        let mut tree1 = SampleTree::new([(0.5, 1)]);
        assert_eq!(tree1.total, 0.5);
        assert_eq!(tree1.data, vec![SampleNode::new(0.0, 0.5, 1)]);
        assert_eq!(tree1.sample(), Some(1));
        assert_eq!(tree1.data, vec![SampleNode::new(0.0, 0.0, 1)]);
        assert_eq!(tree1.total, 0.0);
        assert_eq!(tree1.sample(), None);
        tree1.reset();
        assert_eq!(tree1.total, 0.5);
        assert_eq!(tree1.data, vec![SampleNode::new(0.0, 0.5, 1)]);

        let mut tree6 =
            SampleTree::new([(0.5, 1), (0.5, 2), (0.5, 3), (0.5, 4), (0.5, 5), (0.5, 6)]);
        assert_eq!(tree6.total, 3.0);
        assert_eq!(
            tree6.data,
            vec![
                SampleNode::new(1.5, 0.5, 1),
                SampleNode::new(0.5, 0.5, 2),
                SampleNode::new(0.5, 0.5, 3),
                SampleNode::new(0.0, 0.5, 4),
                SampleNode::new(0.0, 0.5, 5),
                SampleNode::new(0.0, 0.5, 6)
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
