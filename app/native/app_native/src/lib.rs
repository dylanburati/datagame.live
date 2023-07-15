mod importer;
mod macros;
mod probability;
mod tinylang;
mod trivia;
mod types;

use std::sync::Mutex;

use rustler::{Encoder, Env, Error, NifResult, ResourceArc, Term};

use trivia::KnowledgeBase;

use crate::{
    trivia::{ActiveDeck, TriviaDef},
    types::{Deck, ExDeck},
};

mod atoms {
    rustler::atoms! {
        ok,
    }
}

struct KnowledgeBaseResource {
    pub data: Mutex<KnowledgeBase>,
}

fn load(env: Env, _: Term) -> bool {
    rustler::resource!(KnowledgeBaseResource, env);
    true
}

#[rustler::nif]
fn parse_spreadsheet(env: Env<'_>, sheet_names: Vec<String>, json: String) -> NifResult<Term<'_>> {
    // let prefix = std::time::SystemTime::UNIX_EPOCH
    //     .elapsed()
    //     .expect("2038")
    //     .as_micros()
    //     .to_string();
    // let _ = std::fs::write(format!("{}_in.json", prefix), json.as_bytes())
    //     .map_err(|_| Error::Term(Box::new("IO error before")))?;
    let decks = importer::parse_spreadsheet(sheet_names, json).map_err(|err| {
        let kind = err.kind();
        match kind {
            importer::ErrorKind::DeserializationError(err) => {
                Error::Term(Box::new(format!("{}", err)))
            }
            importer::ErrorKind::BadMajorDimension => Error::Term(Box::new(format!("{}", err))),
            importer::ErrorKind::WrongNumberOfRanges => Error::Term(Box::new(format!("{}", err))),
            _ => Error::Term(Box::new("Unknown error")),
        }
    })?;
    // for ad in decks.iter() {
    //     let file = std::fs::OpenOptions::new()
    //         .write(true)
    //         .create_new(true)
    //         .open(format!("{}_{}.json", prefix, ad.deck.id))
    //         .map_err(|_| Error::Term(Box::new("IO error")))?;
    //     serde_json::to_writer_pretty(file, ad)
    //         .map_err(|_| Error::Term(Box::new("IO error")))?;
    // }
    Ok(rustler::types::tuple::make_tuple(
        env,
        &[atoms::ok().encode(env), decks.encode(env)],
    ))
}

#[rustler::nif]
fn prepare_decks(env: Env<'_>, decks: Vec<Deck>) -> Term<'_> {
    let mut res = vec![];
    for mut deck in decks {
        trivia::scale_popularity(&mut deck);
        res.push(ExDeck::from(deck));
    }
    res.encode(env)
}

#[rustler::nif]
fn deserialize_deck(env: Env<'_>, stored: ExDeck) -> NifResult<Term<'_>> {
    let deck = Deck::try_from(stored).map_err(|err| Error::Term(Box::new(format!("{}", err))))?;
    Ok(rustler::types::tuple::make_tuple(
        env,
        &[atoms::ok().encode(env), deck.encode(env)],
    ))
}

#[rustler::nif]
fn load_trivia_base(env: Env<'_>, stored: Vec<ExDeck>) -> NifResult<Term<'_>> {
    let mut active_decks = vec![];
    for ex_deck in stored {
        let id = ex_deck.id;
        let deck = Deck::try_from(ex_deck)
            .map_err(|err| Error::Term(Box::new(format!("{} (id = {})", err, id))))?;
        active_decks.push(ActiveDeck::new(deck))
    }
    let mut base = KnowledgeBase {
        decks: active_decks,
        trivia_defs: vec![],
    };
    trivia::seed(&mut base).map_err(|err| Error::Term(Box::new(format!("{}", err))))?;
    let trivia_def_list: Vec<_> = base
        .trivia_defs
        .iter()
        .map(TriviaDef::common)
        .cloned()
        .collect();
    let resource = ResourceArc::new(KnowledgeBaseResource {
        data: Mutex::new(base),
    });
    Ok(rustler::types::tuple::make_tuple(
        env,
        &[
            atoms::ok().encode(env),
            resource.encode(env),
            trivia_def_list.encode(env),
        ],
    ))
}

#[rustler::nif]
fn get_trivia(
    env: Env<'_>,
    kb_sync: ResourceArc<KnowledgeBaseResource>,
    def_id: usize,
) -> NifResult<Term<'_>> {
    let kb: std::sync::MutexGuard<'_, KnowledgeBase> = kb_sync.data.try_lock().unwrap();
    let (trivia, exps) = kb
        .get_trivia(def_id)
        .map_err(|err| Error::Term(Box::new(format!("{}", err))))?;
    Ok(rustler::types::tuple::make_tuple(
        env,
        &[
            atoms::ok().encode(env),
            trivia.encode(env),
            exps.encode(env),
        ],
    ))
}

rustler::init!(
    "Elixir.App.Native",
    [
        parse_spreadsheet,
        prepare_decks,
        deserialize_deck,
        load_trivia_base,
        get_trivia
    ],
    load = load
);
