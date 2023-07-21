use std::ops::Deref;

use chrono::NaiveDateTime;
use rustler::{
    Atom, Decoder, Encoder, Env, NifMap, NifResult, NifStruct, NifTaggedEnum, NifUnitEnum, Term,
};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;

fn try_decode_field<'a, T>(term: Term<'a>, field: Atom) -> NifResult<T>
where
    T: Decoder<'a>,
{
    match Decoder::decode(term.map_get(field)?) {
        Err(_) => Err(::rustler::Error::RaiseTerm(Box::new(format!(
            "Could not decode field :{:?} on %{{}}",
            field
        )))),
        Ok(value) => Ok(value),
    }
}

rustler::atoms! {
    atom_label = "label",
    atom_values = "values",

    atom_number = "number",
    atom_date = "date",
    atom_string = "string",
    atom_lat_lng = "lat_lng",
    atom_unit = "unit",
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagDef {
    pub(crate) label: String,
    pub(crate) values: Vec<SmallVec<[String; 2]>>,
}

impl<'b> Decoder<'b> for TagDef {
    fn decode(term: Term<'b>) -> NifResult<Self> {
        let label = try_decode_field(term, atom_label())?;
        let values_dec: Vec<Vec<String>> = try_decode_field(term, atom_values())?;
        let values = values_dec.into_iter().map(|a| a.into()).collect();
        Ok(TagDef { label, values })
    }
}

impl Encoder for TagDef {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        let mut map = rustler::types::map::map_new(env);
        map = map.map_put(atom_label(), &self.label).unwrap();
        let values_enc: Vec<_> = self.values.iter().map(|a| a.as_slice()).collect();
        map = map.map_put(atom_values(), values_enc).unwrap();
        map
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, NifUnitEnum)]
pub enum StatUnit {
    Kilometer,
    Dollar,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct NaiveDateTimeExt(NaiveDateTime);

impl NaiveDateTimeExt {
    pub fn strftime_format() -> &'static str {
        "%Y-%m-%dT%H:%M:%S"
    }
}

impl From<NaiveDateTime> for NaiveDateTimeExt {
    fn from(value: NaiveDateTime) -> Self {
        Self(value)
    }
}

impl Deref for NaiveDateTimeExt {
    type Target = NaiveDateTime;

    fn deref(&self) -> &Self::Target {
        &self.0
    }
}

impl Serialize for NaiveDateTimeExt {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'b> Deserialize<'b> for NaiveDateTimeExt {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'b>,
    {
        Deserialize::deserialize(deserializer).map(Self)
    }
}

impl<'b> Decoder<'b> for NaiveDateTimeExt {
    fn decode(term: Term<'b>) -> NifResult<Self> {
        let s = term.decode()?;
        NaiveDateTime::parse_from_str(s, Self::strftime_format())
            .map(NaiveDateTimeExt)
            .map_err(|_| rustler::Error::RaiseTerm(Box::new("Could not parse datetime")))
    }
}

impl Encoder for NaiveDateTimeExt {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        self.format(Self::strftime_format()).to_string().encode(env)
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, NifTaggedEnum)]
#[serde(tag = "kind")]
pub enum StatArray {
    Number {
        unit: Option<StatUnit>,
        values: Vec<Option<f64>>,
    },
    Date {
        values: Vec<Option<NaiveDateTimeExt>>,
    },
    String {
        values: Vec<Option<String>>,
    },
    LatLng {
        values: Vec<Option<(f64, f64)>>,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, NifMap)]
pub struct StatDef {
    pub label: String,
    pub data: StatArray,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, NifMap)]
pub struct Card {
    pub title: String,
    pub unique_id: Option<String>,
    pub is_disabled: bool,
    pub notes: Option<String>,
    pub popularity: f64,
    pub category: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, NifMap)]
pub struct Edge {
    pub left: u64,
    pub right: u64,
    pub info: Option<String>,
}

impl Edge {
    pub fn new(left: u64, right: u64, info: Option<String>) -> Self {
        Self { left, right, info }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, NifUnitEnum)]
pub enum EdgeSide {
    Left,
    Right,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, NifMap)]
pub struct Pairing {
    pub label: String,
    pub is_symmetric: bool,
    pub data: Vec<Edge>,
}

#[derive(Debug, Default, Clone, PartialEq, Serialize, Deserialize, NifMap)]
pub struct CardTable {
    pub cards: Vec<Card>,
    pub tag_defs: Vec<TagDef>,
    pub stat_defs: Vec<StatDef>,
    pub pairings: Vec<Pairing>,
}

#[derive(Clone, PartialEq, NifMap)]
pub struct Deck {
    pub id: u64,
    pub revision: u64,
    pub title: String,
    pub spreadsheet_id: String,
    pub image_url: Option<String>,
    pub data: CardTable,
}

#[derive(PartialEq, NifStruct)]
#[module = "App.Entities.Deck"]
pub struct ExDeck {
    pub id: u64,
    pub revision: u64,
    pub title: String,
    pub spreadsheet_id: String,
    pub image_url: Option<String>,
    pub data: String,
}

impl TryFrom<ExDeck> for Deck {
    type Error = serde_json::Error;

    fn try_from(value: ExDeck) -> Result<Self, Self::Error> {
        let data: CardTable = serde_json::from_str(&value.data)?;
        Ok(Deck {
            id: value.id,
            revision: value.revision,
            title: value.title,
            spreadsheet_id: value.spreadsheet_id,
            image_url: value.image_url,
            data,
        })
    }
}

impl From<Deck> for ExDeck {
    fn from(value: Deck) -> Self {
        ExDeck {
            id: value.id,
            revision: value.revision,
            title: value.title,
            spreadsheet_id: value.spreadsheet_id,
            image_url: value.image_url,
            data: serde_json::to_string(&value.data).unwrap(),
        }
    }
}

#[derive(Debug, PartialEq, Eq, NifTaggedEnum)]
pub enum Callout {
    Warning(String),
    Error(String),
}

#[derive(NifMap)]
pub struct AnnotatedDeck {
    pub deck: Deck,
    pub callouts: Vec<Callout>,
}
