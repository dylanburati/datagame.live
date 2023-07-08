use std::{
    cell::RefCell,
    cmp::Ordering,
    collections::{BTreeMap, HashMap, HashSet},
    fmt::{Debug, Display},
};

use error_chain::error_chain;
use rustler::{Encoder, NifUnitEnum};
use smallvec::SmallVec;

use crate::{
    probability::{Blend, ReservoirSample, SampleTree},
    tinylang::{self, IntermediateExpr, OwnedExprValue},
    types::{Card, CardTable, Deck, EdgeSide, NaiveDateTimeExt},
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

mod selectors {
    use crate::tinylang;

    pub struct Deck {}
    pub struct Category {
        pub difficulty: f64,
    }
    pub struct Stat {
        pub difficulty: f64,
        pub expression: tinylang::Expression,
        pub return_type: tinylang::ExprType,
    }
    pub struct StatNested {
        pub expression: tinylang::Expression,
        pub return_type: tinylang::ExprType,
    }
    pub struct Card {
        pub difficulty: f64,
        pub stats: Vec<StatNested>,
    }
    pub struct Tag {
        pub difficulty: f64,
        pub which: usize,
    }
}

mod instances {
    use crate::tinylang;

    #[derive(Debug, Clone, Copy)]
    pub struct Deck {}

    #[derive(Debug, Clone)]
    pub struct Category(pub String);

    #[derive(Debug, Clone)]
    pub struct Stat {
        pub value: tinylang::OwnedExprValue,
        pub value_type: tinylang::ExprType,
    }

    #[derive(Debug, Clone)]
    pub struct Card {
        pub index: usize,
        pub stats: Vec<Stat>,
    }

    #[derive(Debug, Clone)]
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

type CardIndex = usize;
type PairingIndex = usize;

enum CardCond {
    /// The selected Card belongs to the instance Category
    Category(instances::Category),
    /// The pairing at the index has a link from the selected Card to any
    /// Card
    EdgeOut(PairingIndex),
    /// The pairing at the index has a link from the instance Card to the
    /// selected Card
    Edge(CardIndex, PairingIndex),
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
        // TODO validate 0 or 1 CardCond::Edge
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
                CardCond::Edge(left, which) => {
                    let indices = deck.pairings[*which]
                        .edge_infos
                        .range((*left, 0)..(left + 1, 0))
                        .map(|((_, i), _)| *i)
                        .sample_weighted(n, |i| {
                            f64::exp(-self.difficulty * deck.data.cards[*i].popularity)
                        });
                    return indices
                        .into_iter()
                        .filter_map(|i| {
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
                            Some(instances::Card { index: i, stats })
                        })
                        .collect();
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
                        CardCond::Edge(_, _) => true,
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
                Some(instances::Card { index: i, stats })
            })
            .take(n)
            .collect()
        })
    }
}

enum TagCond {
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
        };
        proxy
            .select_n(deck, conds, n)
            .into_iter()
            .map(|mut inst| (inst.index, inst.stats.pop().unwrap()))
            .collect()
    }
}

enum StatCond {
    Edge(instances::Card),
    NoEdge(instances::Card),
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
        left: Option<selectors::Category>,
        right: selectors::Card,
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
    total: u8,
}

impl RankingCommon {
    fn num_answers(&self) -> u8 {
        if self.is_single {
            1
        } else {
            self.total
        }
    }
}

pub enum RankingDef {
    Card {
        left: Option<selectors::Category>,
        right: selectors::Card,
        params: RankingCommon,
    },
    CardCard {
        left: selectors::Card,
        right: selectors::Card,
        stat: selectors::StatNested,
        separator: char,
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

impl Display for TriviaAnswerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

/// Compat
#[derive(Debug)]
pub struct TriviaAnswer<T> {
    id: u8,
    answer: String,
    question_value: T,
}

impl<T: Display> Display for TriviaAnswer<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{{ id: {:?}, answer: {:?}, question_value: {} }}",
            self.id, self.answer, self.question_value
        )
    }
}

/// Compat
#[derive(Debug)]
pub struct Trivia<T> {
    question: String,
    answer_type: TriviaAnswerType,
    min_answers: u8,
    max_answers: u8,
    question_value_type: String,
    options: Vec<TriviaAnswer<T>>,
    prefilled_answers: Vec<TriviaAnswer<T>>,
}

impl<T: Display> Display for Trivia<T> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        writeln!(f, "Trivia")?;
        writeln!(f, "  question: {:?}", self.question)?;
        writeln!(f, "  answer_type: {}", self.answer_type)?;
        writeln!(f, "  min_answers: {}", self.min_answers)?;
        writeln!(f, "  max_answers: {}", self.max_answers)?;
        writeln!(f, "  question_value_type: {:?}", self.question_value_type)?;
        write!(f, "  options:")?;
        if self.options.is_empty() {
            writeln!(f, " []")?;
        } else {
            writeln!(f)?;
            for e in self.options.iter() {
                writeln!(f, "    - {}", e)?;
            }
        }
        write!(f, "  prefilled_answers:")?;
        if self.prefilled_answers.is_empty() {
            writeln!(f, " []")?;
        } else {
            writeln!(f)?;
            for e in self.prefilled_answers.iter() {
                writeln!(f, "    - {}", e)?;
            }
        }
        Ok(())
    }
}

impl<T> Trivia<T> {
    pub fn new_selection(
        params: &MultipleChoiceCommon,
        question: String,
        question_value_type: &str,
        options: Vec<TriviaAnswer<T>>,
    ) -> Self {
        Self {
            question,
            answer_type: TriviaAnswerType::Selection,
            min_answers: params.min_answers(),
            max_answers: params.max_answers(),
            question_value_type: question_value_type.into(),
            options,
            prefilled_answers: vec![],
        }
    }

    pub fn new_ranking(
        params: &RankingCommon,
        question: String,
        question_value_type: &str,
        options: Vec<TriviaAnswer<T>>,
    ) -> Self {
        let answer_type = match (params.is_asc, params.is_single) {
            (true, true) => TriviaAnswerType::StatMin,
            (true, false) => TriviaAnswerType::StatAsc,
            (false, true) => TriviaAnswerType::StatMax,
            (false, false) => TriviaAnswerType::StatDesc,
        };
        Self {
            question,
            answer_type,
            min_answers: params.num_answers(),
            max_answers: params.num_answers(),
            question_value_type: question_value_type.into(),
            options,
            prefilled_answers: vec![],
        }
    }
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
        NotPlural {
            description("a card can only have 1 stat in a particular column")
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct QValue(OwnedExprValue);

impl<T> From<T> for QValue
where
    T: Into<OwnedExprValue>,
{
    fn from(value: T) -> Self {
        Self(value.into())
    }
}

impl Encoder for QValue {
    fn encode<'a>(&self, env: rustler::Env<'a>) -> rustler::Term<'a> {
        match &self.0 {
            OwnedExprValue::Bool(v) => v.encode(env),
            OwnedExprValue::Number(v) => v.encode(env),
            OwnedExprValue::LatLng(v) => v.encode(env),
            OwnedExprValue::Date(v) => v.encode(env),
            OwnedExprValue::String(v) => v.encode(env),
            OwnedExprValue::StringArray(v) => v.as_slice().encode(env),
        }
    }
}

impl Display for QValue {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match &self.0 {
            OwnedExprValue::Bool(v) => write!(f, "{:?}", v),
            OwnedExprValue::Number(v) => write!(f, "{:?}", v),
            OwnedExprValue::LatLng(v) => write!(f, "{:?}", v),
            OwnedExprValue::Date(v) => write!(f, "{:?}", v),
            OwnedExprValue::String(v) => write!(f, "{:?}", v),
            OwnedExprValue::StringArray(v) => write!(f, "{:?}", v),
        }
    }
}

type GradeableTrivia = (Trivia<QValue>, Vec<TriviaExp>);

pub trait TriviaGen {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia>;
}

fn transform_multiple_choice<E, F>(
    answers_t: Vec<E>,
    answers_f: Vec<E>,
    params: &MultipleChoiceCommon,
    fun: F,
) -> (Vec<TriviaAnswer<QValue>>, Vec<TriviaExp>)
where
    F: Fn(u8, E) -> TriviaAnswer<QValue>,
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
                if params.min_true != 1 || params.max_true != 1 {
                    return Err(ErrorKind::NotPlural.into());
                }
                let cat = match left {
                    Some(sel) => Some(
                        sel.select(deck, &[])
                            .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?,
                    ),
                    None => None,
                };
                let conds: Vec<_> = cat
                    .iter()
                    .map(|inst| CardCond::Category(inst.clone()))
                    .collect();
                let mut answers = right.select_n(deck, &conds, params.total.into());
                if answers.len() < params.total.into() {
                    return Err(ErrorKind::NotEnoughData(params.total).into());
                }
                let subj = answers
                    .pop()
                    .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?;
                let (answers, expectations) =
                    transform_multiple_choice(vec![subj.clone()], answers, params, |id, inst| {
                        TriviaAnswer {
                            id,
                            answer: inst.stats[0].value.get_string().unwrap().to_owned(),
                            question_value: deck.data.cards[inst.index].title.clone().into(),
                        }
                    });
                let card_title = deck.data.cards[subj.index].title.as_str();
                let question = common.question_format.as_str().replace("{}", card_title);
                let trivia = Trivia::new_selection(params, question, "string", answers);
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
                    right.select_n(deck, &[TagCond::Edge(subj.index)], params.max_true.into());
                if answers_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let answers_f = right.select_n(
                    deck,
                    &[TagCond::NoEdge(subj.index)],
                    params.max_false().into(),
                );
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, inst| {
                        TriviaAnswer {
                            id,
                            answer: inst.value,
                            // TODO lookup tag->cards
                            question_value: OwnedExprValue::StringArray(SmallVec::new()).into(),
                        }
                    });
                let card_title = deck.data.cards[subj.index].title.as_str();
                let question = common.question_format.as_str().replace("{}", card_title);
                let trivia = Trivia::new_selection(params, question, "string[]", answers);
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
                        TriviaAnswer {
                            id,
                            answer: deck.data.cards[inst.index].title.clone(),
                            question_value: deck.data.tag_defs[left.which].values[inst.index]
                                .clone()
                                .into(),
                        }
                    });
                let question = common.question_format.as_str().replace("{}", &subj.value);
                let trivia = Trivia::new_selection(params, question, "string[]", answers);
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
                        .select(deck, &[CardCond::Edge(inst.index, *pairing_id)])
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
                            .map(|e| CardCond::Predicate(e.clone(), Some(inst.index)))
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
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, (inst, inst2)| {
                        TriviaAnswer {
                            id,
                            answer: format!(
                                "{} {} {}",
                                deck.data.cards[inst.index].title,
                                separator,
                                deck.data.cards[inst2.index].title
                            ),
                            // TODO edge information
                            question_value: String::new().into(),
                        }
                    });
                let question = common.question_format.clone();
                let trivia = Trivia::new_selection(params, question, "string", answers);
                Ok((trivia, expectations))
            }
        }
    }
}

fn transform_ranking<E, F>(
    answers_in: Vec<E>,
    params: &RankingCommon,
    mut fun: F,
) -> (Vec<TriviaAnswer<QValue>>, Vec<TriviaExp>)
where
    F: FnMut(u8, E) -> (f64, TriviaAnswer<QValue>),
{
    let mut answers = vec![];
    let mut numeric = vec![];
    for (id, inst) in answers_in.into_iter().enumerate() {
        let (x, ans) = fun(id as u8, inst);
        answers.push(ans);
        numeric.push(x);
    }
    let mut order: Vec<_> = numeric.into_iter().enumerate().collect();
    order.sort_by(|(_, a), (_, b)| {
        let o = a.partial_cmp(b).unwrap_or(Ordering::Equal);
        if params.is_asc {
            o
        } else {
            o.reverse()
        }
    });
    let mut iter = order.iter().peekable();
    let mut acc: Vec<u8> = vec![];
    let mut groups: Vec<Vec<u8>> = vec![];
    while let Some(curr) = iter.next() {
        acc.push(curr.0 as u8);
        match iter.peek() {
            Some((_, x)) if x == &curr.1 => (),
            _ => {
                groups.push(acc.drain(..).collect());
            }
        }
    }
    let expectations = if params.is_single {
        let ids = groups.drain(..).next().unwrap();
        vec![TriviaExp::Any { ids }]
    } else {
        let mut exps = vec![];
        let mut min_pos = 0u8;
        for ids in groups {
            let l = ids.len() as u8;
            exps.push(TriviaExp::AllPos { ids, min_pos });
            min_pos += l;
        }
        exps
    };
    (answers, expectations)
}

impl TriviaGen for RankingDef {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia> {
        match self {
            RankingDef::Card {
                left,
                right,
                params,
            } => {
                let stat_sel = match &right.stats[..] {
                    [sel] => sel,
                    _ => {
                        return Err(Error::from(ErrorKind::Msg(
                            "expected one StatNested".into(),
                        )))
                    }
                };
                let subj = match left {
                    Some(sel) => Some(
                        sel.select(deck, &[])
                            .ok_or_else(|| Error::from(ErrorKind::NotEnoughData(1)))?,
                    ),
                    None => None,
                };
                let conds: Vec<_> = subj
                    .iter()
                    .map(|inst| CardCond::Category(inst.clone()))
                    .collect();
                let answers = right.select_n(deck, &conds, params.total.into());
                if answers.len() < params.total.into() {
                    return Err(ErrorKind::NotEnoughData(params.total).into());
                }
                let (answers, expectations) = transform_ranking(answers, params, |id, mut inst| {
                    let stat = inst.stats.pop().unwrap();
                    let (num, question_value) = match stat.value {
                        OwnedExprValue::Number(v) => (v, v.into()),
                        OwnedExprValue::Date(v) => (
                            v.timestamp_millis() as f64,
                            v.format(NaiveDateTimeExt::strftime_format())
                                .to_string()
                                .into(),
                        ),
                        _ => panic!(
                            "RankingDef::Card: right.stats[0] must have return type Number or Date"
                        ),
                    };
                    let ans = TriviaAnswer {
                        id,
                        answer: deck.data.cards[inst.index].title.clone().into(),
                        question_value,
                    };
                    (num, ans)
                });
                let question = match subj {
                    Some(instances::Category(cat)) => {
                        common.question_format.as_str().replace("{}", &cat)
                    }
                    None => common.question_format.clone(),
                };
                let question_value_type = match stat_sel.return_type {
                    tinylang::ExprType::Number => "number",
                    tinylang::ExprType::Date => "string",
                    _ => panic!(
                        "RankingDef::Card: right.stats[0] must have return type Number or Date"
                    ),
                };
                let trivia = Trivia::new_ranking(params, question, question_value_type, answers);
                Ok((trivia, expectations))
            }
            RankingDef::CardCard {
                left,
                right,
                stat,
                separator,
                params,
            } => {
                let lconds = vec![CardCond::ExpressionOut(stat.expression.clone())];
                let rconds = vec![CardCond::ExpressionIn(stat.expression.clone())];
                let expr = stat.expression.optimize(&deck.data, &deck.data).unwrap();
                let mut answers = vec![];
                for _ in 0..2 {
                    let subjects = left.select_n(deck, &lconds, params.total.into());
                    for inst in subjects {
                        if let Some(inst2) = right.select(deck, &rconds) {
                            answers.push((inst, inst2));
                            if answers.len() >= params.total.into() {
                                break;
                            }
                        }
                    }
                    if answers.len() >= params.total.into() {
                        break;
                    }
                }
                if answers.len() < params.total.into() {
                    return Err(ErrorKind::NotEnoughData(params.total).into());
                }
                let (answers, expectations) = transform_ranking(
                    answers,
                    params,
                    |id, (inst, inst2)| {
                        let value = expr
                            .get_value(inst.index, inst2.index)
                            .unwrap()
                            .expect("null-checker lied");
                        let (num, question_value) = match value {
                            OwnedExprValue::Number(v) => (v, v.into()),
                            OwnedExprValue::Date(v) => (
                                v.timestamp_millis() as f64,
                                v.format(NaiveDateTimeExt::strftime_format()).to_string().into(),
                            ),
                            _ => panic!(
                                "RankingDef::Card: right.stats[0] must have return type Number or Date"
                            ),
                        };
                        let ans = TriviaAnswer {
                            id,
                            answer: format!(
                                "{} {} {}",
                                deck.data.cards[inst.index].title,
                                separator,
                                deck.data.cards[inst2.index].title
                            ),
                            question_value,
                        };
                        (num, ans)
                    },
                );
                let question = common.question_format.clone();
                let question_value_type = match stat.return_type {
                    tinylang::ExprType::Number => "number",
                    tinylang::ExprType::Date => "string",
                    _ => panic!(
                        "RankingDef::Card: right.stats[0] must have return type Number or Date"
                    ),
                };
                let trivia = Trivia::new_ranking(params, question, question_value_type, answers);
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
    fn decks() -> Vec<Deck> {
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
                d.deck
            })
            .collect()
    }

    #[rstest]
    fn test_multiple_choice_card_stat(
        decks: &Vec<Deck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::CardStat {
            left: None,
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![selectors::StatNested {
                    expression: expr("R\"Capital\"").unwrap(),
                    return_type: ExprType::String,
                }],
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
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[4], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_multiple_choice_card_tag(
        decks: &Vec<Deck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::CardTag {
            left: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
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
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[0], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_multiple_choice_tag_card(
        decks: &Vec<Deck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
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
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
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
            question_format: "Which movie was directed by {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[0], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[0], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_multiple_choice_pairing(
        decks: &Vec<Deck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::Pairing {
            left: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            separator: '+',
            pairing_id: 0,
            predicate: Some(
                expr(
                    "L\"Pronoun\" == R\"Partner pronoun\" and R\"Pronoun\" == L\"Partner pronoun\"",
                )
                .unwrap(),
            ),
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
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[3], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_ranking_card_number(
        decks: &Vec<Deck>,
        #[values(false, true)] is_asc: bool,
        #[values(false, true)] is_single: bool,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = RankingDef::Card {
            left: Some(selectors::Category { difficulty: 0.0 }),
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![selectors::StatNested {
                    expression: expr("R\"Spotify plays\"").unwrap(),
                    return_type: ExprType::Number,
                }],
            },
            params: RankingCommon {
                is_asc,
                is_single,
                total: 3,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 2,
            question_format: "Rank these songs from most to least Spotify plays".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[2], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        if !is_asc && !is_single {
            for _ in 0..1000 {
                let _ = definition.get_trivia(&decks[2], &common)?;
            }
        }
        Ok(())
    }

    #[rstest]
    fn test_ranking_card_date(
        decks: &Vec<Deck>,
        #[values(false, true)] is_asc: bool,
        #[values(false, true)] is_single: bool,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = RankingDef::Card {
            left: Some(selectors::Category { difficulty: 0.0 }),
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![selectors::StatNested {
                    expression: expr("R\"Birth date\"").unwrap(),
                    return_type: ExprType::Date,
                }],
            },
            params: RankingCommon {
                is_asc,
                is_single,
                total: 3,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 3,
            question_format: "Rank these people from earliest to latest birth dates".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[3], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        if !is_asc && !is_single {
            for _ in 0..1000 {
                let _ = definition.get_trivia(&decks[3], &common)?;
            }
        }
        Ok(())
    }

    #[rstest]
    fn test_ranking_card_squared(
        decks: &Vec<Deck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = RankingDef::CardCard {
            left: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            stat: selectors::StatNested {
                expression: expr("L\"Coordinates\" <-> R\"Coordinates\"").unwrap(),
                return_type: ExprType::Number,
            },
            separator: '↔',
            params: RankingCommon {
                is_asc: true,
                is_single: true,
                total: 3,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 4,
            question_format: "Pick the closest pair of cities geographically.".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[4], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[4], &common)?;
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
