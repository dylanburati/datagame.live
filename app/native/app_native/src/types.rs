use std::ops::Deref;

use chrono::NaiveDateTime;
use rustler::{Atom, Decoder, Encoder, Env, NifMap, NifResult, NifTaggedEnum, NifUnitEnum, Term};
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

    atom_data = "data",

    atom_cards = "cards",
    atom_tag_defs = "tag_defs",
    atom_stat_defs = "stat_defs",

    atom_id = "id",
    atom_revision = "revision",
    atom_title = "title",
    atom_spreadsheet_id = "spreadsheet_id",

    atom_deck = "deck",
    atom_callouts = "callouts",
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
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

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, NifUnitEnum)]
pub enum StatUnit {
    Kilometer,
    Dollar,
}

#[derive(Debug, PartialEq, Eq)]
pub struct NaiveDateTimeExt(NaiveDateTime);

impl NaiveDateTimeExt {
    fn strftime_format() -> &'static str {
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

#[derive(Debug, PartialEq, Serialize, Deserialize)]
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

impl<'b> Decoder<'b> for StatArray {
    fn decode(term: Term<'b>) -> NifResult<Self> {
        if let Ok(tuple) = rustler::types::tuple::get_tuple(term) {
            let name = tuple
                .get(0)
                .and_then(|&first| rustler::types::atom::Atom::from_term(first).ok())
                .ok_or(rustler::Error::RaiseAtom("invalid_variant"))?;
            if tuple.len() == 2 && name == atom_string() {
                let unit = try_decode_field(tuple[1], atom_unit())?;
                let values = try_decode_field(tuple[1], atom_values())?;
                return Ok(StatArray::Number { unit, values });
            }
            if tuple.len() == 2 && name == atom_date() {
                let values = try_decode_field(tuple[1], atom_values())?;
                return Ok(StatArray::Date { values });
            }
            if tuple.len() == 2 && name == atom_string() {
                let values = try_decode_field(tuple[1], atom_values())?;
                return Ok(StatArray::String { values });
            }
            if tuple.len() == 2 && name == atom_lat_lng() {
                let values = try_decode_field(tuple[1], atom_values())?;
                return Ok(StatArray::LatLng { values });
            }
        }
        Err(rustler::Error::RaiseAtom("invalid_variant"))
    }
}

impl Encoder for StatArray {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        match self {
            StatArray::Number { unit, values } => {
                let mut map = rustler::types::map::map_new(env);
                map = map.map_put(atom_unit(), unit).unwrap();
                map = map.map_put(atom_values(), values).unwrap();
                rustler::types::tuple::make_tuple(env, &[atom_number().encode(env), map])
            }
            StatArray::Date { values } => {
                let map = Term::map_from_arrays(env, &[atom_values()], &[values])
                    .expect("Failed to create map");
                rustler::types::tuple::make_tuple(env, &[atom_date().encode(env), map])
            }
            StatArray::String { values } => {
                let map = Term::map_from_arrays(env, &[atom_values()], &[values])
                    .expect("Failed to create map");
                rustler::types::tuple::make_tuple(env, &[atom_string().encode(env), map])
            }
            StatArray::LatLng { values } => {
                let map = Term::map_from_arrays(env, &[atom_values()], &[values])
                    .expect("Failed to create map");
                rustler::types::tuple::make_tuple(env, &[atom_lat_lng().encode(env), map])
            }
        }
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize, NifMap)]
pub struct StatDef {
    pub(crate) label: String,
    pub(crate) data: StatArray,
}

#[derive(Debug, PartialEq, Serialize, Deserialize, NifMap)]
pub struct Card {
    pub(crate) title: String,
    pub(crate) unique_id: Option<String>,
    pub(crate) is_disabled: bool,
    pub(crate) notes: Option<String>,
    pub(crate) popularity: f64,
    pub(crate) category: Option<String>,
}

#[derive(Debug, Default, PartialEq, Serialize, Deserialize, NifMap)]
pub struct CardTable {
    pub(crate) cards: Vec<Card>,
    pub(crate) tag_defs: Vec<TagDef>,
    pub(crate) stat_defs: Vec<StatDef>,
}

#[derive(PartialEq, Serialize, Deserialize, NifMap)]
pub struct Deck {
    pub(crate) id: u64,
    pub(crate) revision: u64,
    pub(crate) title: String,
    pub(crate) spreadsheet_id: String,
    pub(crate) data: CardTable,
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, NifTaggedEnum)]
#[serde(tag = "kind", content = "message")]
pub enum Callout {
    Warning(String),
    Error(String),
}

#[derive(Serialize, Deserialize, NifMap)]
pub struct AnnotatedDeck {
    pub(crate) deck: Deck,
    pub(crate) callouts: Vec<Callout>,
}
