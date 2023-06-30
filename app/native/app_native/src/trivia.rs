use std::{
    cell::RefCell,
    cmp::Ordering,
    collections::{BTreeMap, HashMap, HashSet},
};

use crate::{
    probability::{ReservoirSample, SampleTree},
    tinylang::{self, IntermediateExpr},
    types::{CardTable, Deck},
};

pub fn scale_popularity(deck: &mut Deck) {
    let mut pop_series: Vec<_> = deck
        .data
        .cards
        .iter()
        .filter(|c| !c.is_disabled)
        .map(|c| c.popularity)
        .collect();
    if pop_series.len() > 1 {
        pop_series.sort_by(|a, b| a.partial_cmp(b).unwrap_or(Ordering::Equal));
        let pop_min = pop_series.first().unwrap();
        let pop_max = pop_series.last().unwrap();
        let last_idx = pop_series.len() - 1;
        let pop_med = if last_idx % 2 == 0 {
            *pop_series.get(last_idx / 2).unwrap()
        } else {
            0.5 * pop_series.get(last_idx / 2).unwrap()
                + 0.5 * pop_series.get(last_idx / 2 + 1).unwrap()
        };
        let pop_range = (pop_max - pop_min).max(1e-6);
        let relative_med = (pop_med - pop_min) / pop_range;
        let curve_factor = if 0.0 < relative_med && relative_med < 1.0 {
            -1.0 / relative_med.log2()
        } else {
            1.0
        };
        deck.data
            .cards
            .iter_mut()
            .for_each(|c| c.popularity = ((c.popularity - pop_min) / pop_range).powf(curve_factor))
    }
}

pub struct KnowledgeBase {
    decks: Vec<ActiveDeck>,
}

pub struct ActiveDeck {
    data: CardTable,
    pairings: Vec<ActivePairing>,
    views: RefCell<HashMap<u64, DeckView>>,
}

impl ActiveDeck {
    pub fn new(data: CardTable) -> Self {
        let pairings = data
            .pairings
            .iter()
            .map(|p| {
                let mut edge_infos = BTreeMap::new();
                for edge in p.data.iter() {
                    let li = edge.left as usize;
                    let ri = edge.right as usize;
                    if !data.cards[li].is_disabled && !data.cards[ri].is_disabled {
                        edge_infos.insert((li, ri), edge.info.clone());
                        if p.is_symmetric {
                            edge_infos.insert((ri, li), edge.info.clone());
                        }
                    }
                }
                ActivePairing { edge_infos }
            })
            .collect();
        Self {
            data,
            pairings,
            views: RefCell::new(HashMap::default()),
        }
    }

    fn with_iter<F, R>(&self, difficulty: f64, f: F) -> R
    where
        F: FnOnce(DeckViewIter<'_>) -> R,
    {
        let key = difficulty.to_bits();
        let mut map = self.views.borrow_mut();
        let view = map
            .entry(key)
            .or_insert_with(|| DeckView::new(&self.data, difficulty));
        f(view.iter())
    }
}

struct ActivePairing {
    edge_infos: BTreeMap<(usize, usize), Option<String>>,
}

struct DeckView {
    difficulty: f64,
    tree: SampleTree<usize>,
}

struct DeckViewIter<'a> {
    inner: &'a mut DeckView,
}

impl<'a> Iterator for DeckViewIter<'a> {
    type Item = usize;

    fn next(&mut self) -> Option<Self::Item> {
        self.inner.tree.sample()
    }
}

impl<'a> Drop for DeckViewIter<'a> {
    fn drop(&mut self) {
        self.inner.tree.reset()
    }
}

impl DeckView {
    fn new(card_table: &CardTable, difficulty: f64) -> Self {
        let sample_tree = SampleTree::new(
            card_table
                .cards
                .iter()
                .enumerate()
                .filter(|(_, c)| !c.is_disabled)
                .map(|(i, c)| (f64::exp(-difficulty * c.popularity), i)),
        );
        DeckView {
            difficulty,
            tree: sample_tree,
        }
    }

    fn iter(&mut self) -> DeckViewIter<'_> {
        DeckViewIter { inner: self }
    }
}

pub enum TriviaExp {
    /// The selection must contain every ID in the list
    All { ids: Vec<u8> },
    /// The selection must not contain any ID in the list
    None { ids: Vec<u8> },
    /// The selection must not contain more than `max` IDs in the list
    NoneLenient { ids: Vec<u8>, max: u8 },
    /// The selection must contain at least one ID from the list
    Any { ids: Vec<u8> },
    /// The slice of the selection `min_pos..min_pos + ids.len()` must contain
    /// every ID in the list
    AllPos { ids: Vec<u8>, min_pos: u8 },
}

// pub trait TriviaGen<'a> {
//     type Subject;
//     type Answer;

//     fn get_subject(&self, kb: &mut KnowledgeBase<'a>) -> Option<Self::Subject>;

//     fn get_answers(
//         &self,
//         kb: &mut KnowledgeBase<'a>,
//         subject: Self::Subject,
//         invert: bool,
//     ) -> Vec<Self::Answer>;

//     fn get_expectations(&self, answers: Vec<Self::Answer>) -> Vec<TriviaExp>;
// }

mod selectors {
    pub struct Deck {}
    pub struct Category {
        pub difficulty: f64,
    }
    pub struct Card {
        pub difficulty: f64,
    }
    pub struct Tag {
        pub difficulty: f64,
        pub which: usize,
    }
}

mod instances {
    #[derive(Debug, Clone, Copy)]
    pub struct Deck {}

    #[derive(Debug)]
    pub struct Category(pub String);

    #[derive(Debug, Clone, Copy)]
    pub struct Card(pub usize);

    #[derive(Debug)]
    pub struct Tag {
        pub which: usize,
        pub value: String,
    }
}

trait Select {
    type Item;
    type Cond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item>;

    fn select(&self, deck: &ActiveDeck, conds: &[Self::Cond]) -> Option<Self::Item> {
        self.select_n(deck, conds, 1).into_iter().next()
    }
}

impl Select for selectors::Deck {
    type Item = instances::Deck;
    type Cond = ();

    fn select_n(&self, _deck: &ActiveDeck, _conds: &[Self::Cond], _n: usize) -> Vec<Self::Item> {
        vec![instances::Deck {}]
    }
}

impl Select for selectors::Category {
    type Item = instances::Category;
    type Cond = ();

    fn select_n(&self, deck: &ActiveDeck, _conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        let categories = deck.with_iter(self.difficulty, |iter| {
            let mut acc = HashSet::new();
            for i in iter {
                if let Some(cat) = deck.data.cards[i].category.as_ref() {
                    let _ = acc.insert(cat);
                    if acc.len() >= n {
                        break;
                    }
                }
            }
            acc
        });
        categories
            .into_iter()
            .map(|s| instances::Category(s.clone()))
            .collect()
    }
}

enum CardCond {
    Deck(instances::Deck),
    Category(instances::Category),
    EdgeOut(usize),
    Edge(instances::Card, usize),
    NoEdge(instances::Card, usize),
    PredicateOut(tinylang::Expression),
    Predicate(tinylang::Expression, Option<instances::Card>),
    Tag(instances::Tag),
}

impl Select for selectors::Card {
    type Item = instances::Card;
    type Cond = CardCond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        let mut lexprs: Vec<IntermediateExpr<'_>> = vec![];
        let mut rexprs: Vec<(IntermediateExpr<'_>, Option<usize>)> = vec![];
        let mut prohibited = HashSet::new();
        // TODO validate 0 or 1 CardCond::Edge
        for c in conds.iter() {
            match c {
                CardCond::PredicateOut(expr) => {
                    lexprs.push(expr.optimize(&deck.data, &deck.data).unwrap())
                }
                CardCond::Predicate(expr, o) => rexprs.push((
                    expr.optimize(&deck.data, &deck.data).unwrap(),
                    o.map(|instance| instance.0),
                )),
                CardCond::Edge(instances::Card(left), which) => {
                    let indices = deck.pairings[*which]
                        .edge_infos
                        .range((*left, 0)..(left + 1, 0))
                        .map(|((_, i), _)| *i)
                        .sample_weighted(n, |i| {
                            f64::exp(-self.difficulty * deck.data.cards[*i].popularity)
                        });
                    return indices.into_iter().map(instances::Card).collect();
                },
                CardCond::NoEdge(instances::Card(left), which) => {
                    let indices = deck.pairings[*which]
                        .edge_infos
                        .range((*left, 0)..(left + 1, 0))
                        .map(|((_, i), _)| *i);
                    prohibited.extend(indices);
                },
                _ => (),
            }
        }
        let indices: Vec<_> = deck.with_iter(self.difficulty, |iter| {
            iter.filter(|i| {
                let all_true = !prohibited.contains(i);
                let all_true = all_true && lexprs.iter().all(|expr| expr.has_vars(Some(*i), None));
                let all_true = all_true
                    && rexprs.iter().all(|(expr, left)| {
                        let check = expr
                            .get_value(left.unwrap_or(0), *i)
                            .unwrap()
                            .and_then(|v| v.get_bool().copied());
                        matches!(check, Some(true))
                    });
                all_true
                    && conds.iter().all(|c| match c {
                        CardCond::Deck(_) => true,
                        CardCond::Predicate(_, _) => true,
                        CardCond::PredicateOut(_) => true,
                        CardCond::Edge(_, _) => true,
                        CardCond::NoEdge(_, _) => true,
                        CardCond::Category(instances::Category(cat)) => deck.data.cards[*i]
                            .category
                            .as_ref()
                            .is_some_and(|ci| ci == cat),
                        CardCond::EdgeOut(which) => deck.pairings[*which]
                            .edge_infos
                            .range((*i, 0)..(i + 1, 0))
                            .next()
                            .is_some(),
                        CardCond::Tag(instances::Tag { which, value }) => {
                            deck.data.tag_defs[*which].values[*i].contains(value)
                        }
                    })
            })
            .take(n)
            .collect()
        });
        indices.into_iter().map(instances::Card).collect()
    }
}

enum TagCond {
    Edge(instances::Card),
    NoEdge(instances::Card),
}

impl Select for selectors::Tag {
    type Item = instances::Tag;
    type Cond = TagCond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        let prohibited = match conds {
            [] => None,
            [TagCond::Edge(instances::Card(i))] => {
                return deck.data.tag_defs[self.which].values[*i]
                    .iter()
                    .map(|s| instances::Tag {
                        which: self.which,
                        value: s.clone(),
                    })
                    .collect()
            }
            [TagCond::NoEdge(instances::Card(i))] => {
                Some(&deck.data.tag_defs[self.which].values[*i])
            }
            _ => panic!("Multiple conds not supported for selectors::Tag"),
        };
        let tags = deck.with_iter(self.difficulty, |iter| {
            let mut acc = HashSet::new();
            for i in iter {
                let ti = &deck.data.tag_defs[self.which].values[i];
                let intersects = match prohibited {
                    Some(lst) => lst.iter().any(|t| ti.contains(t)),
                    None => false,
                };
                if !intersects {
                    for t in ti.iter().take(n - acc.len()) {
                        let _ = acc.insert(t);
                    }
                    if acc.len() >= n {
                        break;
                    }
                }
            }
            acc
        });
        tags.into_iter()
            .map(|s| instances::Tag {
                which: self.which,
                value: s.clone(),
            })
            .collect()
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use crate::{importer, tinylang::expr};

    use super::{scale_popularity, selectors, ActiveDeck, CardCond, Select};

    #[test]
    fn test_select() -> Result<(), Box<dyn std::error::Error>> {
        let json_bytes = std::fs::read("../../1687456135278600_in.json")?;
        let json = String::from_utf8(json_bytes)?;
        let decks = importer::parse_spreadsheet(
            vec![
                "Movies".into(),
                "Animals".into(),
                "Music:Billoard US".into(),
                "The Rich and Famous".into(),
                "Places".into(),
                "Characters".into(),
            ],
            json,
        )?;
        let decks: Vec<_> = decks
            .into_iter()
            .map(|d| d.deck)
            .map(|mut d| {
                scale_popularity(&mut d);
                d
            })
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let selector = selectors::Category { difficulty: 0.0 };
        let subject = selector.select(&decks[4], &[]).expect("Instance");
        writeln!(std::io::stderr(), "subject = {:?}", subject)?;
        let selector2 = selectors::Card { difficulty: -5.0 };
        let answer = selector2
            .select(
                &decks[4],
                &[
                    CardCond::Category(subject),
                    CardCond::Predicate(expr("R\"Capital\"?").unwrap(), None),
                ],
            )
            .expect("Capital");
        writeln!(
            std::io::stderr(),
            "answer = {:?}",
            decks[4].data.cards[answer.0]
        )?;
        let selector = selectors::Card { difficulty: -0.5 };
        for _ in 0..1000 {
            let criteria = expr(
                "L\"Pronoun\" == R\"Partner pronoun\" and R\"Pronoun\" == L\"Partner pronoun\"",
            )?;
            let subjects1 = selector.select_n(&decks[3], &[CardCond::EdgeOut(0)], 3);
            assert_eq!(subjects1.len(), 3);
            let mut pairs: Vec<_> = subjects1
                .iter()
                .map(|instance| {
                    let inst2 = selector
                        .select(&decks[3], &[CardCond::Edge(*instance, 0)])
                        .unwrap_or_else(|| {
                            panic!(
                                "no edge {} {}",
                                instance.0, &decks[3].data.cards[instance.0].title
                            )
                        });
                    (instance.0, inst2.0)
                })
                .collect();
            let pair2 = (1..10)
                .filter_map(|_| {
                    let instance =
                        selector.select(&decks[3], &[CardCond::PredicateOut(criteria.clone())])?;
                    selector
                        .select(
                            &decks[3],
                            &[
                                CardCond::NoEdge(instance, 0),
                                CardCond::Predicate(criteria.clone(), Some(instance)),
                            ],
                        )
                        .map(|inst2| (instance.0, inst2.0))
                })
                .next()
                .expect("10th attempt");
            pairs.push(pair2);
            // let &[(c00, c01), (c10, c11), (c20, c21), (c30, c31)] = &pairs[..] else {
            //     panic!("{:?}", pairs);
            // };
            // writeln!(
            //     std::io::stderr(),
            //     "{} + {}\n{} + {}\n{} + {}\n{} + {}\n\n",
            //     &decks[3].data.cards[c00].title,
            //     &decks[3].data.cards[c01].title,
            //     &decks[3].data.cards[c10].title,
            //     &decks[3].data.cards[c11].title,
            //     &decks[3].data.cards[c20].title,
            //     &decks[3].data.cards[c21].title,
            //     &decks[3].data.cards[c30].title,
            //     &decks[3].data.cards[c31].title,
            // )?;
        }
        Ok(())
    }
}

/*
Deck, Card, true
    Kiss, Marry, Kill (points for giving the same answers)

Deck, Card, R"AO3 fanfics"?
    Rank these characters from most to fewest fanfiction works on AO3.

Deck, Card, R"Description"?
    Who is this?

Deck, Card, R"Spotify plays"?
    Rank these songs from most to least Spotify plays.

Deck, Card, R"Capital"?
    What is the capital of {}?

Category, Card, true
    Kiss, Marry, Kill (points for giving the same answers)

Category, Card, R"Wikipedia views"?
    Rank these places from most to least popular on Wikipedia.

Category, Card, R"Population"?
    Rank these places by population (highest first).

Category, Card, R"Wikipedia views"?
    Rank these people from most to least popular on Wikipedia.

Category, Card, R"Birth date"?, {stat: now - R"Birth date"}
    Rank these people from oldest to youngest.

Category, Card, R"Letterboxd rating"?
    Rank these {} movies from highest to lowest Letterboxd rating.

Card, ../Card, PairingRules("Couple")
    Pick the fake couple.

Tag("Director"), Card, true
    Which movie was directed by {}?

Card, Tag("Director"), true
    Who directed {}?

Card, ../Card, L"Coordinates"? and R"Coordinates"?, {stat: L"Coordinates" <-> R"Coordinates"}
    Pick the closest pair of cities geographically.
*/

// pub enum TriviaSource {
//     None,
//     Category,
//     Card,
//     Tag(usize),
//     Stat(usize),
//     Pairing(usize),
// }

// pub enum AnswerType {
//     Selection {
//         max_true: u8,
//         max_false: u8,
//         total: u8,
//     },
//     Ranking {
//         is_ascending: bool,
//         is_singular: bool,
//         total: u8,
//     },
//     Hangman,
// }

// pub struct TriviaDefCommon {
//     deck_id: u64,
//     answer_type: AnswerType,
//     question_format: String,
// }

// /// Trivia def with `Card` subject, `Tag` answers,
// /// and relationship `tag in card.tags[tag_label]`
// ///
// /// Invariant: answer type is Selection
// pub struct CardTagTriviaDef {
//     common: TriviaDefCommon,
//     difficulty: f64,
// }

// /// Trivia def with `Card` subject, `char` answers,
// /// and relationship `answer in subject.title`
// ///
// /// Invariant: answer type is Hangman
// pub struct CardCharsTriviaDef {
//     common: TriviaDefCommon,
//     difficulty: f64,
// }

// pub struct HangmanAnswer {
//     answer: char,
//     question_value: SmallVec<[u32; 2]>,
// }

// impl<'a> TriviaGen<'a> for CardCharsTriviaDef {
//     type Subject = &'a Card;
//     type Answer = HangmanAnswer;

//     fn get_subject(&self, kb: &mut KnowledgeBase<'a>) -> Option<Self::Subject> {
//         let mut view = kb.view(self.common.deck_id, self.difficulty);
//         view
//             .iter()
//             .next()
//             .map(|(table, idx)| &table.cards[idx])
//     }

//     fn get_answers(
//         &self,
//         _kb: &mut KnowledgeBase<'a>,
//         subject: Self::Subject,
//         invert: bool,
//     ) -> Vec<Self::Answer> {
//         if invert {
//             return vec![];
//         }

//         let mut res: Vec<_> = ('A'..='Z')
//             .map(|c| HangmanAnswer {
//                 answer: c,
//                 question_value: SmallVec::new(),
//             })
//             .collect();
//         let iter = subject
//             .title
//             .chars()
//             .map(|c| c.to_ascii_uppercase())
//             .enumerate();
//         for (i, c) in iter {
//             let i: u32 = i.try_into().unwrap();
//             match (c as usize).checked_sub('A' as usize) {
//                 Some(j) if j < 26 => {
//                     res[j].question_value.push(i);
//                 }
//                 _ => match res.iter_mut().find(|a| a.answer == c) {
//                     Some(a) => {
//                         a.question_value.push(i);
//                     }
//                     None => res.push(HangmanAnswer {
//                         answer: c,
//                         question_value: SmallVec::from_buf_and_len([i, 0], 1),
//                     }),
//                 },
//             }
//         }
//         res
//     }

//     fn get_expectations(&self, answers: Vec<Self::Answer>) -> Vec<TriviaExp> {
//         let mut included = vec![];
//         let mut excluded = vec![];
//         for (id, answer) in answers.iter().enumerate() {
//             let id = id.try_into().unwrap();
//             if answer.question_value.is_empty() {
//                 excluded.push(id);
//             } else {
//                 included.push(id);
//             }
//         }
//         vec![
//             TriviaExp::All { ids: included },
//             TriviaExp::NoneLenient {
//                 ids: excluded,
//                 max: 1,
//             },
//         ]
//     }
// }
