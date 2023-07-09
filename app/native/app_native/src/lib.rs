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
    trivia::ActiveDeck,
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
fn load_trivia_base(stored: Vec<ExDeck>) -> NifResult<ResourceArc<KnowledgeBaseResource>> {
    let mut active_decks = vec![];
    for ex_deck in stored {
        let id = ex_deck.id;
        let deck = Deck::try_from(ex_deck)
            .map_err(|err| Error::Term(Box::new(format!("{} {}", id, err))))?;
        active_decks.push(ActiveDeck::new(deck))
    }
    let mut base = KnowledgeBase {
        decks: active_decks,
        trivia_defs: vec![],
    };
    trivia::seed(&mut base).map_err(|err| Error::Term(Box::new(format!("{}", err))))?;
    let resource: ResourceArc<KnowledgeBaseResource> = ResourceArc::new(KnowledgeBaseResource {
        data: Mutex::new(base),
    });
    Ok(resource)
}

#[rustler::nif]
fn get_trivia(
    env: Env<'_>,
    kb_sync: ResourceArc<KnowledgeBaseResource>,
    def_id: u64,
) -> NifResult<Term<'_>> {
    let kb: std::sync::MutexGuard<'_, KnowledgeBase> = kb_sync.data.try_lock().unwrap();
    let result = def_id * 64 + kb.decks.len() as u64;
    Ok(result.encode(env))
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

// #[cfg(test)]
// mod tests {
//     use crate::{importer, tinylang::{expr, ExprType, ExprValue}, types::{StatDef, StatArray}};

//     #[test]
//     fn test_speed() -> Result<(), Box<dyn std::error::Error>> {
//         let json_bytes = std::fs::read("../../1687456135278600_in.json")?;
//         let json = String::from_utf8(json_bytes)?;
//         let decks = importer::parse_spreadsheet(
//             vec![
//                 "Movies".into(),
//                 "Animals".into(),
//                 "Music:Billoard US".into(),
//                 "The Rich and Famous".into(),
//                 "Places".into(),
//                 "Characters".into(),
//             ],
//             json,
//         )?;
//         assert_eq!(decks.len(), 6);
//         let card_table = &decks[2].deck.data;
//         let expr = expr("(L\"Spotify plays\" / R\"Spotify plays\")").unwrap();
//         let expr = expr.optimize(card_table, card_table).unwrap();
//         assert_eq!(expr.get_type().unwrap(), ExprType::Number);
//         // let numbers = match &card_table.stat_defs[0].data {
//         //     StatArray::Number { unit: _, values } => values,
//         //     _ => panic!(),
//         // };
//         for i in 0..card_table.cards.len() {
//             for j in 0..card_table.cards.len() {
//                 let ev = expr.get_value(i, j).unwrap();
//                 assert!(matches!(ev, None | Some(ExprValue::Number(_))), "{:?}", ev)
//                 // match numbers[i].and_then(|x| numbers[j].map(|y| x / y)) {
//                 //     None => (),
//                 //     Some(q) => assert!(q < 1e9),
//                 // }
//             }
//         }
//         Ok(())
//     }
// }
