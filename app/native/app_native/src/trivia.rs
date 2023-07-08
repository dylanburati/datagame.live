use std::{
    cell::RefCell,
    cmp::Ordering,
    collections::{BTreeMap, HashMap, HashSet},
    fmt::Debug,
    sync::Mutex,
};

use error_chain::error_chain;
use rustler::{Encoder, NifUnitEnum};

use crate::{
    probability::{Blend, ReservoirSample, SampleTree},
    tinylang::{self, IntermediateExpr, OwnedExprValue},
    types::{Card, CardTable, Deck, NaiveDateTimeExt},
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
    views: Mutex<RefCell<HashMap<u64, DeckView>>>,
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
            views: Mutex::new(RefCell::new(HashMap::default())),
        }
    }

    fn with_iter<F, R>(&self, difficulty: f64, f: F) -> R
    where
        F: FnOnce(DeckViewIter<'_>) -> R,
    {
        let key = difficulty.to_bits();
        let map_sync = self.views.lock().unwrap();
        let mut map = map_sync.borrow_mut();
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

mod selectors {
    use crate::tinylang;

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
    pub struct Stat {
        pub difficulty: f64,
        pub expression: tinylang::Expression,
        pub return_type: tinylang::ExprType,
    }
}

mod instances {
    use crate::tinylang;

    #[derive(Debug, Clone, Copy)]
    pub struct Deck {}

    #[derive(Debug, Clone)]
    pub struct Category(pub String);

    #[derive(Debug, Clone, Copy)]
    pub struct Card(pub usize);

    #[derive(Debug, Clone)]
    pub struct Tag {
        pub which: usize,
        pub value: String,
    }

    #[derive(Debug, Clone)]
    pub struct Stat {
        pub card: usize,
        pub value: tinylang::OwnedExprValue,
        pub value_type: tinylang::ExprType,
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
    /// The selected Card belongs to the instance Category
    Category(instances::Category),
    /// The pairing at the index has a link from the selected Card to any
    /// Card
    EdgeOut(usize),
    /// The pairing at the index has a link from the instance Card to the
    /// selected Card
    Edge(instances::Card, usize),
    /// The pairing at the index has no link from the instance Card to the
    /// selected Card
    NoEdge(instances::Card, usize),
    /// The expression evaluates to true when `left` is the instance Card and
    /// `right` is the selected Card
    Predicate(tinylang::Expression, Option<instances::Card>),
    /// All left-side variables in the expression are present on the selected
    /// Card
    ExpressionOut(tinylang::Expression),
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
        let mut lexprs: Vec<IntermediateExpr<'_>> = vec![];
        let mut rexprs: Vec<(IntermediateExpr<'_>, Option<usize>)> = vec![];
        let mut prohibited = HashSet::new();
        // TODO validate 0 or 1 CardCond::Edge
        for c in conds.iter() {
            match c {
                CardCond::ExpressionOut(expr) => {
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
                }
                CardCond::NoEdge(instances::Card(left), which) => {
                    let indices = deck.pairings[*which]
                        .edge_infos
                        .range((*left, 0)..(left + 1, 0))
                        .map(|((_, i), _)| *i);
                    prohibited.extend(indices);
                }
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
                        CardCond::Predicate(_, _) => true,
                        CardCond::ExpressionOut(_) => true,
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
                        CardCond::NoTag(instances::Tag { which, value }) => {
                            !deck.data.tag_defs[*which].values[*i].contains(value)
                        }
                        CardCond::TagOut(which) => {
                            !deck.data.tag_defs[*which].values[*i].is_empty()
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
                    .sample(n)
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

enum StatCond {
    Edge(instances::Card),
    NoEdge(instances::Card),
}

impl Select for selectors::Stat {
    type Item = instances::Stat;
    type Cond = StatCond;

    fn select_n(&self, deck: &ActiveDeck, conds: &[Self::Cond], n: usize) -> Vec<Self::Item> {
        let intermediate = self.expression.optimize(&deck.data, &deck.data).unwrap();
        let prohibited = match conds {
            [StatCond::Edge(instances::Card(i))] => {
                let Some(value) = intermediate.get_value(*i, *i).unwrap() else {
                    return vec![];
                };
                return vec![instances::Stat {
                    card: *i,
                    value,
                    value_type: self.return_type,
                }];
            }
            [StatCond::NoEdge(instances::Card(i))] => *i,
            [] => panic!("Zero conds not supported for selectors::Stat"),
            _ => panic!("Multiple conds not supported for selectors::Stat"),
        };
        deck.with_iter(self.difficulty, |iter| {
            let mut acc = vec![];
            for i in iter {
                if i == prohibited {
                    continue;
                }
                if let Some(value) = intermediate.get_value(i, i).unwrap() {
                    acc.push(instances::Stat {
                        card: i,
                        value,
                        value_type: self.return_type,
                    });
                    if acc.len() >= n {
                        break;
                    }
                }
            }
            acc
        })
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

pub struct TriviaDefCommon {
    deck_id: u64,
    question_format: String,
}

pub struct MultipleChoiceCommon {
    min_true: u8,
    max_true: u8,
    total: u8,
    is_inverted: bool,
}

impl MultipleChoiceCommon {
    fn min_false(&self) -> u8 {
        self.total - self.max_true
    }

    fn max_false(&self) -> u8 {
        self.total - self.min_true
    }

    fn min_answers(&self) -> u8 {
        if self.is_inverted {
            self.min_false()
        } else {
            self.min_true
        }
    }

    fn max_answers(&self) -> u8 {
        if self.is_inverted {
            self.max_false()
        } else {
            self.max_true
        }
    }
}

pub enum MultipleChoiceDef {
    CardStat {
        left: selectors::Card,
        right: selectors::Stat,
        params: MultipleChoiceCommon,
    },
    CardTag {
        left: selectors::Card,
        right: selectors::Tag,
        params: MultipleChoiceCommon,
    },
    TagCard {
        left: selectors::Tag,
        right: selectors::Card,
        params: MultipleChoiceCommon,
    },
    Pairing {
        left: selectors::Card,
        right: selectors::Card,
        separator: char,
        pairing_id: usize,
        /// Will be satisfied by incorrect answers, which also must not be in
        /// the pairing
        predicate: Option<tinylang::Expression>,
        // TODO boost
        params: MultipleChoiceCommon,
    },
}

pub struct RankingCommon {
    is_asc: bool,
    is_single: bool,
}

pub enum RankingDef {
    Card {
        left: Option<selectors::Category>,
        right: selectors::Card,
        stat: tinylang::Expression,
        stat_type: tinylang::ExprType,
        params: RankingCommon,
    },
    CardCard {
        left: selectors::Card,
        right: selectors::Card,
        stat: tinylang::Expression,
        stat_type: tinylang::ExprType,
        params: RankingCommon,
    },
}

pub enum HangmanDef {
    Card {
        left: Option<selectors::Category>,
        right: selectors::Card,
    },
}

pub enum TriviaDef {
    MultipleChoice(MultipleChoiceDef),
    Ranking(RankingDef),
    Hangman(HangmanDef),
}

#[derive(Debug, PartialEq, Eq)]
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

/// Compat
#[derive(Debug, NifUnitEnum)]
pub enum TriviaAnswerType {
    Selection,
    Hangman,
    StatAsc,
    StatMin,
    StatDesc,
    StatMax,
}

/// Compat
#[derive(Debug)]
pub struct TriviaAnswer<T: ?Sized> {
    id: u8,
    answer: String,
    question_value: Box<T>,
}

/// Compat
#[derive(Debug)]
pub struct Trivia<T: ?Sized> {
    question: String,
    answer_type: TriviaAnswerType,
    min_answers: u8,
    max_answers: u8,
    question_value_type: String,
    options: Vec<TriviaAnswer<T>>,
    prefilled_answers: Vec<TriviaAnswer<T>>,
}

error_chain! {
    foreign_links {
        DeserializationError(serde_json::Error);
    }

    errors {
        NotEnoughData(c: u8) {
            description("not enough data")
            display("expected at least {} valid item(s) for TriviaDef", c)
        }
    }
}

type GradeableTrivia = (Trivia<dyn Debug>, Vec<TriviaExp>);

pub trait TriviaGen {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia>;
}

// fn box_expr_value(value: OwnedExprValue) -> Box<dyn Debug> {
//     match value {
//         OwnedExprValue::Bool(v) => Box::new(v),
//         OwnedExprValue::Number(v) => Box::new(v),
//         OwnedExprValue::LatLng(v) => Box::new(v),
//         OwnedExprValue::Date(v) => Box::new(v),
//         OwnedExprValue::String(v) => Box::new(v),
//     }
// }

fn transform_multiple_choice<E, F>(
    answers_t: Vec<E>,
    answers_f: Vec<E>,
    params: &MultipleChoiceCommon,
    fun: F,
) -> (Vec<TriviaAnswer<dyn Debug>>, Vec<TriviaExp>)
where
    F: Fn(u8, E) -> TriviaAnswer<dyn Debug>,
{
    let mut ids_t = vec![];
    let mut ids_f = vec![];
    let mut answers = vec![];
    for (id, (t, inst)) in answers_t
        .into_iter()
        .blend(answers_f, params.min_true.into(), params.min_false().into())
        .enumerate()
    {
        if t == params.is_inverted {
            ids_f.push(id as u8);
        } else {
            ids_t.push(id as u8);
        }
        answers.push(fun(id as u8, inst))
    }
    let expectations = vec![
        TriviaExp::All { ids: ids_t },
        TriviaExp::None { ids: ids_f },
    ];
    (answers, expectations)
}

impl TriviaGen for MultipleChoiceDef {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia> {
        match self {
            MultipleChoiceDef::CardStat {
                left,
                right,
                params,
            } => {
                let subj = left
                    .select(deck, &[CardCond::ExpressionOut(right.expression.clone())])
                    .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?;
                let answers_t =
                    right.select_n(deck, &[StatCond::Edge(subj)], params.max_true.into());
                if answers_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let answers_f =
                    right.select_n(deck, &[StatCond::NoEdge(subj)], params.max_false().into());
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, inst| {
                        TriviaAnswer {
                            id,
                            answer: inst.value.get_string().unwrap().to_owned(),
                            question_value: Box::new(deck.data.cards[inst.card].title.clone()),
                        }
                    });
                let card_title = deck.data.cards[subj.0].title.as_str();
                let trivia = Trivia {
                    question: common.question_format.as_str().replace("{}", card_title),
                    answer_type: TriviaAnswerType::Selection,
                    min_answers: params.min_answers(),
                    max_answers: params.max_answers(),
                    question_value_type: "string".into(),
                    options: answers,
                    prefilled_answers: vec![],
                };
                Ok((trivia, expectations))
            }
            MultipleChoiceDef::CardTag {
                left,
                right,
                params,
            } => {
                let subj = left
                    .select(deck, &[CardCond::TagOut(right.which)])
                    .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?;
                let answers_t =
                    right.select_n(deck, &[TagCond::Edge(subj)], params.max_true.into());
                if answers_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let answers_f =
                    right.select_n(deck, &[TagCond::NoEdge(subj)], params.max_false().into());
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, inst| {
                        // TODO lookup tag->cards
                        let question_value: Box<dyn Debug> = Box::new(<Vec<String>>::new());
                        TriviaAnswer {
                            id,
                            answer: inst.value,
                            question_value,
                        }
                    });
                let card_title = deck.data.cards[subj.0].title.as_str();
                let trivia = Trivia {
                    question: common.question_format.as_str().replace("{}", card_title),
                    answer_type: TriviaAnswerType::Selection,
                    min_answers: params.min_answers(),
                    max_answers: params.max_answers(),
                    question_value_type: "string[]".into(),
                    options: answers,
                    prefilled_answers: vec![],
                };
                Ok((trivia, expectations))
            }
            MultipleChoiceDef::TagCard {
                left,
                right,
                params,
            } => {
                let subj = left
                    .select(deck, &[])
                    .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?;
                let answers_t =
                    right.select_n(deck, &[CardCond::Tag(subj.clone())], params.max_true.into());
                if answers_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let answers_f = right.select_n(
                    deck,
                    &[CardCond::NoTag(subj.clone())],
                    params.max_false().into(),
                );
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, inst| {
                        let question_value: Box<dyn Debug> =
                            Box::new(deck.data.tag_defs[left.which].values[inst.0].to_vec());
                        TriviaAnswer {
                            id,
                            answer: deck.data.cards[inst.0].title.clone(),
                            question_value,
                        }
                    });
                let trivia = Trivia {
                    question: common.question_format.as_str().replace("{}", &subj.value),
                    answer_type: TriviaAnswerType::Selection,
                    min_answers: params.min_answers(),
                    max_answers: params.max_answers(),
                    question_value_type: "string[]".into(),
                    options: answers,
                    prefilled_answers: vec![],
                };
                Ok((trivia, expectations))
            }
            MultipleChoiceDef::Pairing {
                left,
                right,
                separator,
                pairing_id,
                predicate,
                params,
            } => {
                let subjects_t = left.select_n(
                    deck,
                    &[CardCond::EdgeOut(*pairing_id)],
                    params.max_true.into(),
                );
                if subjects_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let mut answers_t = vec![];
                for inst in subjects_t {
                    let inst2 = right
                        .select(deck, &[CardCond::Edge(inst, *pairing_id)])
                        .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?;
                    answers_t.push((inst, inst2));
                }
                let lconds: Vec<_> = predicate
                    .iter()
                    .map(|e| CardCond::ExpressionOut(e.clone()))
                    .collect();
                let mut answers_f = vec![];
                for _ in 0..2 {
                    let subjects_f = left.select_n(deck, &lconds, params.max_false().into());
                    for inst in subjects_f {
                        let rconds: Vec<_> = predicate
                            .iter()
                            .map(|e| CardCond::Predicate(e.clone(), Some(inst)))
                            .collect();
                        if let Some(inst2) = right.select(deck, &rconds) {
                            answers_f.push((inst, inst2));
                            if answers_f.len() >= params.max_false().into() {
                                break;
                            }
                        }
                    }
                    if answers_f.len() >= params.min_false().into() {
                        break;
                    }
                }
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false().into()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, (inst, inst2)| {
                        // TODO edge information
                        let question_value: Box<dyn Debug> = Box::new(String::new());
                        TriviaAnswer {
                            id,
                            answer: format!(
                                "{} {} {}",
                                deck.data.cards[inst.0].title,
                                separator,
                                deck.data.cards[inst2.0].title
                            ),
                            question_value,
                        }
                    });
                let trivia = Trivia {
                    question: common.question_format.clone(),
                    answer_type: TriviaAnswerType::Selection,
                    min_answers: params.min_answers(),
                    max_answers: params.max_answers(),
                    question_value_type: "string".into(),
                    options: answers,
                    prefilled_answers: vec![],
                };
                Ok((trivia, expectations))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use rstest::{fixture, rstest};

    use crate::{
        importer,
        tinylang::{expr, ExprType},
    };

    use super::*;

    #[fixture]
    #[once]
    fn decks() -> Vec<ActiveDeck> {
        let json_bytes = std::fs::read("../../1687456135278600_in.json").unwrap();
        let json = String::from_utf8(json_bytes).unwrap();
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
        )
        .unwrap();
        decks
            .into_iter()
            .map(|mut d| {
                scale_popularity(&mut d.deck);
                ActiveDeck::new(d.deck.data)
            })
            .collect()
    }

    #[rstest]
    fn test_multiple_choice_card_stat(
        decks: &Vec<ActiveDeck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let definition = MultipleChoiceDef::CardStat {
            left: selectors::Card { difficulty: -0.5 },
            right: selectors::Stat {
                difficulty: -0.5,
                expression: expr("L\"Capital\"").unwrap(),
                return_type: ExprType::String,
            },
            params: MultipleChoiceCommon {
                min_true: 1,
                max_true: 1,
                total: 4,
                is_inverted: false,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 4,
            question_format: "What is the capital of {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[4], &common)?;
        writeln!(std::io::stderr(), "trivia = {:?}", trivia)?;
        writeln!(std::io::stderr(), "exps = {:?}", exps)?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[4], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_multiple_choice_card_tag(
        decks: &Vec<ActiveDeck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let definition = MultipleChoiceDef::CardTag {
            left: selectors::Card { difficulty: -0.5 },
            right: selectors::Tag {
                difficulty: -0.5,
                which: decks[0]
                    .data
                    .tag_defs
                    .iter()
                    .enumerate()
                    .filter_map(|(i, td)| (td.label == "Director").then_some(i))
                    .next()
                    .unwrap(),
            },
            params: MultipleChoiceCommon {
                min_true: 1,
                max_true: 1,
                total: 4,
                is_inverted: false,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 0,
            question_format: "Who directed {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[0], &common)?;
        writeln!(std::io::stderr(), "trivia = {:?}", trivia)?;
        writeln!(std::io::stderr(), "exps = {:?}", exps)?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[0], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_multiple_choice_tag_card(
        decks: &Vec<ActiveDeck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let definition = MultipleChoiceDef::TagCard {
            left: selectors::Tag {
                difficulty: -0.5,
                which: decks[0]
                    .data
                    .tag_defs
                    .iter()
                    .enumerate()
                    .filter_map(|(i, td)| (td.label == "Director").then_some(i))
                    .next()
                    .unwrap(),
            },
            right: selectors::Card { difficulty: -0.5 },
            params: MultipleChoiceCommon {
                min_true: 1,
                max_true: 1,
                total: 4,
                is_inverted: false,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 0,
            question_format: "Which movie was directed by {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[0], &common)?;
        writeln!(std::io::stderr(), "trivia = {:?}", trivia)?;
        writeln!(std::io::stderr(), "exps = {:?}", exps)?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[0], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_multiple_choice_pairing(
        decks: &Vec<ActiveDeck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let definition = MultipleChoiceDef::Pairing {
            left: selectors::Card { difficulty: -0.5 },
            right: selectors::Card { difficulty: -0.5 },
            separator: '+',
            pairing_id: 0,
            predicate: Some(expr("L\"Pronoun\" == R\"Partner pronoun\" and R\"Pronoun\" == L\"Partner pronoun\"").unwrap()),
            params: MultipleChoiceCommon {
                min_true: 3,
                max_true: 3,
                total: 4,
                is_inverted: true,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 3,
            question_format: "Pick the fake couple.".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[3], &common)?;
        writeln!(std::io::stderr(), "trivia = {:?}", trivia)?;
        writeln!(std::io::stderr(), "exps = {:?}", exps)?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[3], &common)?;
        }
        Ok(())
    }
}

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
