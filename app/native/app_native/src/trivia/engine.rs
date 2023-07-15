use std::collections::HashSet;

use crate::{
    probability::ReservoirSample,
    tinylang::{self, IntermediateExpr, OwnedExprValue},
    types::EdgeSide,
};

use super::types::{
    instances,
    selectors::{self, PairingNested},
    ActiveDeck, GradeableTrivia, TriviaDefCommon,
};
use super::Result;

pub trait Select {
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

type CardIndex = usize;
type PairingIndex = usize;

pub enum CardCond {
    /// The selected Card belongs to the instance Category
    Category(instances::Category),
    /// The pairing at the index has a link from the selected Card to any
    /// Card
    EdgeOut(PairingIndex),
    /// The pairing at the index has no link from the instance Card to the
    /// selected Card
    NoEdge(CardIndex, PairingIndex),
    /// The expression evaluates to true when `left` is the instance Card and
    /// `right` is the selected Card
    Predicate(tinylang::Expression, Option<CardIndex>),
    /// All left-side variables in the expression are present on the selected
    /// Card
    ExpressionOut(tinylang::Expression),
    /// All right-side variables in the expression are present on the selected
    /// Card
    ExpressionIn(tinylang::Expression),
    /// The selected Card has a Tag matching the instance Tag
    Tag(instances::Tag),
    /// The selected Card has no Tag matching the instance Tag
    NoTag(instances::Tag),
    /// The selected Card has a Tag for the tag definition at the index
    TagOut(usize),
}

impl Select for selectors::Card {
    type Item = instances::Card;
    type Cond = CardCond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        // TODO validate no stats
        if let Some(PairingNested { left, which }) = &self.pairing {
            let edges = deck.pairings[*which]
                .edge_infos
                .range((*left, 0)..(left + 1, 0))
                .map(|((_, i), v)| (*i, v.as_ref()))
                .sample_weighted(n, |(i, _)| {
                    f64::exp(-self.difficulty * deck.data.cards[*i].popularity)
                });
            return edges
                .into_iter()
                .map(|(i, info)| instances::Card {
                    index: i,
                    stats: vec![],
                    pairing_info: info.cloned(),
                })
                .collect();
        }

        let stat_exprs: Vec<_> = self
            .stats
            .iter()
            .map(|stat| {
                (
                    stat.expression.optimize(&deck.data, &deck.data).unwrap(),
                    stat.return_type,
                )
            })
            .collect();
        // Left for Out since we're on the left end of the arrow. Right for In
        let mut analyze_exprs: Vec<(IntermediateExpr<'_>, EdgeSide)> = vec![];
        let mut eval_exprs: Vec<(IntermediateExpr<'_>, Option<usize>)> = vec![];
        let mut prohibited = HashSet::new();
        for c in conds.iter() {
            match c {
                CardCond::ExpressionOut(expr) => analyze_exprs.push((
                    expr.optimize(&deck.data, &deck.data).unwrap(),
                    EdgeSide::Left,
                )),
                CardCond::ExpressionIn(expr) => analyze_exprs.push((
                    expr.optimize(&deck.data, &deck.data).unwrap(),
                    EdgeSide::Right,
                )),
                CardCond::Predicate(expr, o) => {
                    eval_exprs.push((expr.optimize(&deck.data, &deck.data).unwrap(), *o))
                }
                CardCond::NoEdge(left, which) => {
                    let indices = deck.pairings[*which]
                        .edge_infos
                        .range((*left, 0)..(left + 1, 0))
                        .map(|((_, i), _)| *i);
                    prohibited.extend(indices);
                }
                _ => (),
            }
        }
        deck.with_iter(self.difficulty, |iter| {
            iter.filter_map(|i| {
                if prohibited.contains(&i) {
                    return None;
                }
                for (expr, side) in analyze_exprs.iter() {
                    let check = match side {
                        EdgeSide::Left => expr.has_vars(Some(i), None),
                        EdgeSide::Right => expr.has_vars(None, Some(i)),
                    };
                    if !check {
                        return None;
                    }
                }
                for (expr, left) in eval_exprs.iter() {
                    let check = expr.get_value(left.unwrap_or(0), i).unwrap();
                    match check {
                        Some(OwnedExprValue::Bool(true)) => (),
                        _ => return None,
                    }
                }
                for cond in conds {
                    let check = match cond {
                        CardCond::Predicate(_, _) => true,
                        CardCond::ExpressionOut(_) => true,
                        CardCond::ExpressionIn(_) => true,
                        CardCond::NoEdge(_, _) => true,
                        CardCond::Category(instances::Category(cat)) => deck.data.cards[i]
                            .category
                            .as_ref()
                            .is_some_and(|ci| ci == cat),
                        CardCond::EdgeOut(which) => deck.pairings[*which]
                            .edge_infos
                            .range((i, 0)..(i + 1, 0))
                            .next()
                            .is_some(),
                        CardCond::Tag(instances::Tag { which, value }) => {
                            deck.data.tag_defs[*which].values[i].contains(value)
                        }
                        CardCond::NoTag(instances::Tag { which, value }) => {
                            !deck.data.tag_defs[*which].values[i].contains(value)
                        }
                        CardCond::TagOut(which) => !deck.data.tag_defs[*which].values[i].is_empty(),
                    };
                    if !check {
                        return None;
                    }
                }
                let mut stats = vec![];
                for (expr, value_type) in stat_exprs.iter() {
                    if let Some(value) = expr.get_value(0, i).unwrap() {
                        stats.push(instances::Stat {
                            value,
                            value_type: *value_type,
                        })
                    } else {
                        return None;
                    }
                }
                Some(instances::Card {
                    index: i,
                    stats,
                    pairing_info: None,
                })
            })
            .take(n)
            .collect()
        })
    }
}

pub enum TagCond {
    Edge(CardIndex),
    NoEdge(CardIndex),
}

impl Select for selectors::Tag {
    type Item = instances::Tag;
    type Cond = TagCond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        let prohibited = match conds {
            [] => None,
            [TagCond::Edge(i)] => {
                return deck.data.tag_defs[self.which].values[*i]
                    .iter()
                    .map(|s| instances::Tag {
                        which: self.which,
                        value: s.clone(),
                    })
                    .sample(n)
            }
            [TagCond::NoEdge(i)] => Some(&deck.data.tag_defs[self.which].values[*i]),
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

impl Select for selectors::Stat {
    type Item = (CardIndex, instances::Stat);
    type Cond = CardCond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        let proxy = selectors::Card {
            difficulty: self.difficulty,
            stats: vec![selectors::StatNested {
                expression: self.expression.clone(),
                return_type: self.return_type,
            }],
            pairing: None,
        };
        proxy
            .select_n(deck, conds, n)
            .into_iter()
            .map(|mut inst| (inst.index, inst.stats.pop().unwrap()))
            .collect()
    }
}

pub trait TriviaGen {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia>;
}
