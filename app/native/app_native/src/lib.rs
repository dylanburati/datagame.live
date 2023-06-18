mod importer;
mod types;

use rustler::{Encoder, Env, Error, NifResult, Term};

use importer::ErrorKind;

// mod atoms {
//     rustler::atoms! {
//         ok,
//         error,
//     }
// }

#[rustler::nif]
fn parse_spreadsheet(
    env: Env<'_>,
    sheet_names: Vec<String>,
    json: String,
) -> NifResult<Term<'_>> {
    // let prefix = SystemTime::UNIX_EPOCH
    //     .elapsed()
    //     .expect("2038")
    //     .as_micros()
    //     .to_string();
    // let _ = std::fs::write(format!("{}_in.json", prefix), json.as_bytes())
    //     .map_err(|_| Error::Term(Box::new("IO error before")))?;
    let decks = importer::parse_spreadsheet(sheet_names, json).map_err(|err| {
        let kind = err.kind();
        match kind {
            ErrorKind::DeserializationError(err) => Error::Term(Box::new(format!("{}", err))),
            ErrorKind::BadMajorDimension => Error::Term(Box::new(format!("{}", err))),
            ErrorKind::WrongNumberOfRanges => Error::Term(Box::new(format!("{}", err))),
            _ => Error::Term(Box::new("Unknown error")),
        }
    })?;
    // for ad in decks.iter() {
    //     let file = OpenOptions::new()
    //         .write(true)
    //         .create_new(true)
    //         .open(format!("{}_{}.json", prefix, ad.deck.id))
    //         .map_err(|_| Error::Term(Box::new("IO error")))?;
    //     serde_json::to_writer_pretty(file, ad)
    //         .map_err(|_| Error::Term(Box::new("IO error")))?;
    // }
    Ok(decks.encode(env))
}

rustler::init!("Elixir.App.Native", [parse_spreadsheet]);

// #[cfg(test)]
// mod tests {
//     use crate::importer;

//     #[test]
//     fn test_speed() -> Result<(), Box<dyn std::error::Error>> {
//         let json_bytes = std::fs::read("../../1687035766546985_in.json")?;
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
//         Ok(())
//     }
// }
