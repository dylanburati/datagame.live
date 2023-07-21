use std::{
    cell::RefCell,
    collections::{BTreeMap, HashMap},
    fmt::{Debug, Display},
};

use rustler::{Decoder, Encoder, NifMap, NifTaggedEnum, NifUnitEnum};
use smallvec::SmallVec;

use crate::{
    probability::SampleTree,
    tinylang::{self, OwnedExprValue},
    types::{CardTable, Deck},
};

pub struct ActivePairing {
    pub edge_infos: BTreeMap<(usize, usize), Option<String>>,
}

pub struct ActiveTagDef {
    pub edge_sources: HashMap<String, SmallVec<[usize; 4]>>,
}

pub struct ActiveDeck {
    pub id: u64,
    pub data: CardTable,
    pub pairings: Vec<ActivePairing>,
    pub tag_defs: Vec<ActiveTagDef>,
    views: RefCell<HashMap<u64, DeckView>>,
}

impl ActiveDeck {
    pub fn new(deck: Deck) -> Self {
        let id = deck.id;
        let data = deck.data;
        let pairings: Vec<ActivePairing> = data
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
        let tag_defs = data
            .tag_defs
            .iter()
            .map(|td| {
                let mut edge_sources = HashMap::new();
                for (i, tcell) in td.values.iter().enumerate() {
                    for t in tcell {
                        edge_sources
                            .entry(t.clone())
                            .or_insert(SmallVec::new())
                            .push(i);
                    }
                }
                ActiveTagDef { edge_sources }
            })
            .collect();
        Self {
            id,
            data,
            pairings,
            tag_defs,
            views: RefCell::new(HashMap::default()),
        }
    }

    pub fn get_pairing_index(&self, name: &str) -> Option<usize> {
        self.data
            .pairings
            .iter()
            .enumerate()
            .find(|(_, p)| p.label == name)
            .map(|pair| pair.0)
    }

    pub fn get_tag_index(&self, name: &str) -> Option<usize> {
        self.data
            .tag_defs
            .iter()
            .enumerate()
            .find(|(_, t)| t.label == name)
            .map(|pair| pair.0)
    }

    pub fn with_iter<F, R>(&self, difficulty: f64, f: F) -> R
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

pub struct DeckView {
    tree: SampleTree<usize>,
}

pub struct DeckViewIter<'a> {
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
    pub fn new(card_table: &CardTable, difficulty: f64) -> Self {
        let sample_tree = SampleTree::new(
            card_table
                .cards
                .iter()
                .enumerate()
                .filter(|(_, c)| !c.is_disabled)
                .map(|(i, c)| (f64::exp(-difficulty * c.popularity), i)),
        );
        DeckView { tree: sample_tree }
    }

    pub fn iter(&mut self) -> DeckViewIter<'_> {
        DeckViewIter { inner: self }
    }
}

pub mod selectors {
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
    pub struct PairingNested {
        pub left: usize,
        pub which: usize,
    }
    pub struct Card {
        pub difficulty: f64,
        pub stats: Vec<StatNested>,
        pub pairing: Option<PairingNested>,
    }
    impl Card {
        pub fn new(difficulty: f64) -> Self {
            Self {
                difficulty,
                stats: vec![],
                pairing: None,
            }
        }
    }
    pub struct Tag {
        pub difficulty: f64,
        pub which: usize,
    }
}

pub mod instances {
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
        pub pairing_info: Option<String>,
    }

    #[derive(Debug, Clone)]
    pub struct Tag {
        pub which: usize,
        pub value: String,
    }
}

#[derive(Debug, Clone, PartialEq, Eq, NifMap)]
pub struct TriviaDefCommon {
    pub deck_id: u64,
    pub question_format: String,
}

#[derive(Debug, PartialEq, Eq, NifTaggedEnum)]
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

#[derive(Debug, Clone, Copy, NifUnitEnum)]
pub enum RankingType {
    Asc,
    Min,
    Desc,
    Max,
}

/// Compat
#[derive(Debug, NifTaggedEnum)]
pub enum TriviaAnswerType {
    Selection,
    Hangman,
    Ranking(RankingType),
}

impl Display for TriviaAnswerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}", self)
    }
}

#[derive(Debug, Clone, Copy, NifUnitEnum)]
pub enum StatAxisMod {
    Age,
    Distance,
}

#[derive(Debug, Clone, Copy, NifMap)]
pub struct StatAnnotation {
    pub axis_mod: Option<StatAxisMod>,
    pub axis_min: Option<f64>,
    pub axis_max: Option<f64>,
}

impl From<StatAxisMod> for StatAnnotation {
    fn from(value: StatAxisMod) -> Self {
        Self {
            axis_mod: Some(value),
            axis_min: None,
            axis_max: None,
        }
    }
}

impl From<(f64, f64)> for StatAnnotation {
    fn from(value: (f64, f64)) -> Self {
        Self {
            axis_mod: None,
            axis_min: Some(value.0),
            axis_max: Some(value.1),
        }
    }
}

/// Compat
#[derive(Debug, NifMap)]
pub struct TriviaAnswer {
    pub id: u8,
    pub answer: String,
    pub question_value: QValue,
}

impl Display for TriviaAnswer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "{{ id: {:?}, answer: {:?}, question_value: {} }}",
            self.id, self.answer, self.question_value
        )
    }
}

/// Compat
#[derive(Debug, NifMap)]
pub struct Trivia {
    pub question: String,
    pub answer_type: TriviaAnswerType,
    pub min_answers: u8,
    pub max_answers: u8,
    pub question_value_type: tinylang::ExprType,
    pub stat_annotation: Option<StatAnnotation>,
    pub options: Vec<TriviaAnswer>,
    pub prefilled_answers: Vec<TriviaAnswer>,
}

impl Display for Trivia {
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
            OwnedExprValue::IntArray(v) => v.encode(env),
            OwnedExprValue::StringArray(v) => v.as_slice().encode(env),
        }
    }
}

impl<'a> Decoder<'a> for QValue {
    fn decode(_term: rustler::Term<'a>) -> rustler::NifResult<Self> {
        Err(rustler::Error::RaiseAtom("not_implemented"))
        // // This probably works, but not worth it to test since Trivia objects
        // // aren't intended to be returned to Rust after they're generated
        //
        // if term.is_atom() {
        //     <bool as Decoder<'a>>::decode(term).map(|v| v.into())
        // } else if term.is_number() {
        //     <f64 as Decoder<'a>>::decode(term).map(|v| v.into())
        // } else if term.is_tuple() {
        //     <(f64, f64) as Decoder<'a>>::decode(term).map(|v| v.into())
        // } else if term.is_binary() {
        //     match <NaiveDateTimeExt as Decoder<'a>>::decode(term) {
        //         Err(_) => (),
        //         Ok(v) => return Ok(v.into()),
        //     }
        //     <String as Decoder<'a>>::decode(term).map(|v| v.into())
        // } else if term.is_list() {
        //     match <Vec<i64> as Decoder<'a>>::decode(term) {
        //         Err(_) => (),
        //         Ok(v) => return Ok(v.into()),
        //     };
        //     <Vec<String> as Decoder<'a>>::decode(term).map(|v| v.as_slice().into())
        // } else {
        //     Err(rustler::Error::RaiseAtom("bad_variant"))
        // }
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
            OwnedExprValue::IntArray(v) => write!(f, "{:?}", v),
            OwnedExprValue::StringArray(v) => write!(f, "{:?}", v),
        }
    }
}

pub type GradeableTrivia = (Trivia, Vec<TriviaExp>);

pub trait SanityCheck {
    type Error;

    fn sanity_check(&self) -> Result<(), Self::Error>;
}
