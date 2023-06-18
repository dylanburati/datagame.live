use chrono::NaiveDateTime;
use rustler::{Encoder, Env, NifMap, NifTaggedEnum, NifUnitEnum, Term};
use serde::{Deserialize, Serialize};
use smallvec::SmallVec;

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct TagDef {
    pub(crate) label: String,
    pub(crate) values: Vec<SmallVec<[String; 2]>>,
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

#[derive(Debug, PartialEq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum StatArray {
    Number {
        unit: Option<StatUnit>,
        values: Vec<Option<f64>>,
    },
    Date {
        values: Vec<Option<NaiveDateTime>>,
    },
    String {
        values: Vec<Option<String>>,
    },
    LatLng {
        values: Vec<Option<(f64, f64)>>,
    },
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
                let values_enc: Vec<_> = values
                    .iter()
                    .map(|mbd| mbd.map(|d| format!("{:?}", d)))
                    .collect();
                let map = Term::map_from_arrays(env, &[atom_values()], &[values_enc])
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

#[derive(Debug, PartialEq, Serialize, Deserialize)]
pub struct StatDef {
    pub(crate) label: String,
    pub(crate) data: StatArray,
}

impl Encoder for StatDef {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        let mut map = rustler::types::map::map_new(env);
        map = map.map_put(atom_label(), &self.label).unwrap();
        map = map.map_put(atom_data(), &self.data).unwrap();
        map
    }
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

#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct CardTable {
    pub(crate) cards: Vec<Card>,
    pub(crate) tag_defs: Vec<TagDef>,
    pub(crate) stat_defs: Vec<StatDef>,
}

impl Encoder for CardTable {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        let mut map = rustler::types::map::map_new(env);
        map = map.map_put(atom_cards(), &self.cards).unwrap();
        map = map.map_put(atom_tag_defs(), &self.tag_defs).unwrap();
        map = map.map_put(atom_stat_defs(), &self.stat_defs).unwrap();
        map
    }
}

#[derive(PartialEq, Serialize, Deserialize)]
pub struct Deck {
    pub(crate) id: u64,
    pub(crate) revision: u64,
    pub(crate) title: String,
    pub(crate) spreadsheet_id: String,
    pub(crate) data: CardTable,
}

impl Encoder for Deck {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        let mut map = rustler::types::map::map_new(env);
        map = map.map_put(atom_id(), self.id).unwrap();
        map = map.map_put(atom_revision(), self.revision).unwrap();
        map = map.map_put(atom_title(), &self.title).unwrap();
        map = map.map_put(atom_spreadsheet_id(), &self.spreadsheet_id).unwrap();
        map = map.map_put(atom_data(), &self.data).unwrap();
        map
    }
}

#[derive(Debug, PartialEq, Eq, Serialize, Deserialize, NifTaggedEnum)]
pub enum Callout {
    Warning(String),
    Error(String),
}

#[derive(Serialize, Deserialize)]
pub struct AnnotatedDeck {
    pub(crate) deck: Deck,
    pub(crate) callouts: Vec<Callout>,
}

impl Encoder for AnnotatedDeck {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        let mut map = rustler::types::map::map_new(env);
        map = map.map_put(atom_deck(), &self.deck).unwrap();
        map = map.map_put(atom_callouts(), &self.callouts).unwrap();
        map
    }
}