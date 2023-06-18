use std::collections::HashSet;

use chrono::{NaiveDate, NaiveTime};
use error_chain::error_chain;
use lazy_static::lazy_static;
use regex::Regex;
use serde::{Deserialize};

use crate::types::{Card, CardTable, Deck, StatArray, StatDef, StatUnit, TagDef, Callout, AnnotatedDeck};

fn sheet_column_name(index: usize) -> String {
    let chars: Vec<_> = std::iter::successors(Some(index), |x| Some(x / 26).filter(|xn| *xn > 0))
        .map(|x| char::from_u32(('A' as u32) + (x % 26) as u32).unwrap())
        .collect();
    chars.into_iter().rev().collect()
}

#[derive(Clone, Copy)]
struct RawColumn<'a> {
    index: usize,
    header: &'a String,
    body: &'a [String],
}

struct NamedColumns<'a> {
    title: Option<RawColumn<'a>>,
    unique_id: Option<RawColumn<'a>>,
    is_disabled: Option<RawColumn<'a>>,
    notes: Option<RawColumn<'a>>,
    popularity: Option<RawColumn<'a>>,
    category: Option<RawColumn<'a>>,
}

fn parse_cards(named_columns: NamedColumns<'_>, callouts: &mut Vec<Callout>) -> Vec<Card> {
    let mut cards = vec![];
    let Some(title_column) = named_columns.title else {
        return cards
    };
    let mut id_set = HashSet::new();

    for (row_index, cell) in title_column.body.iter().enumerate() {
        if cell.is_empty() {
            // TODO stop after 10 errors of same type
            callouts.push(Callout::Error(format!(
                "Title can not be empty ({}{})",
                sheet_column_name(title_column.index),
                row_index + 1
            )))
        }

        let unique_id = named_columns
            .unique_id
            .and_then(|col| col.body.get(row_index))
            .filter(|s| !s.is_empty())
            .cloned();
        let is_disabled = named_columns
            .is_disabled
            .and_then(|col| col.body.get(row_index))
            .map(|s| {
                !matches!(
                    s.as_str(),
                    "" | "0" | "n" | "N" | "no" | "No" | "NO" | "false" | "False" | "FALSE"
                )
            })
            .unwrap_or(false);
        let notes = named_columns
            .notes
            .and_then(|col| col.body.get(row_index))
            .filter(|s| !s.is_empty())
            .cloned();
        let popularity = match named_columns.popularity {
            Some(col) => {
                match col
                    .body
                    .get(row_index)
                    .map(|s: &String| -> std::result::Result<f64, _> { s.parse() })
                {
                    Some(Ok(val)) => val,
                    Some(Err(_)) => {
                        callouts.push(Callout::Error(format!(
                            "Expected a number for popularity ({}{})",
                            sheet_column_name(col.index),
                            row_index + 1
                        )));
                        0.0
                    }
                    None => 0.0,
                }
            }
            None => 0.0,
        };
        let category = named_columns
            .category
            .and_then(|col| col.body.get(row_index))
            .filter(|s| !s.is_empty())
            .cloned();

        if let Some(id) = unique_id.clone() {
            if !id_set.insert(id) {
                callouts.push(Callout::Error(format!(
                    "Duplicate ID ({}{})",
                    sheet_column_name(named_columns.unique_id.unwrap().index),
                    row_index + 1
                )));
            }
        }
        cards.push(Card {
            title: cell.to_owned(),
            unique_id,
            is_disabled,
            notes,
            popularity,
            category,
        });
    }
    cards
}

fn parse_tag_defs(
    tag_columns: Vec<RawColumn<'_>>,
    len: usize,
    callouts: &mut Vec<Callout>,
) -> Vec<TagDef> {
    let mut tag_defs = vec![];
    let mut labels = HashSet::new();
    for col in tag_columns {
        if col.body.len() > len {
            callouts.push(Callout::Warning(format!(
                "Skipping data below row {} in column {}",
                len,
                sheet_column_name(col.index)
            )));
        }
        if col.body.iter().all(|s| s.is_empty()) {
            continue;
        }
        if labels.contains(col.header) {
            callouts.push(Callout::Warning(format!(
                "Skipping tag column with duplicate label: {} ({})",
                col.header,
                sheet_column_name(col.index)
            )));
            continue;
        }
        labels.insert(col.header.clone());
        let label = col.header.clone();

        let values = col
            .body
            .iter()
            .take(len)
            .map(|s| {
                s.split(',')
                    .map(|tag| tag.trim())
                    .filter(|tag| !tag.is_empty())
                    .map(|tag| tag.to_owned())
                    .collect()
            })
            .collect();
        tag_defs.push(TagDef { label, values });
    }
    tag_defs
}

trait StatArrayParser {
    fn parse(&self, src: &[String]) -> Option<StatArray>;
}

// impl<F> StatArrayParser for F
// where F: Fn(&String) -> ParseResult<NaiveDateTime> {
//     fn parse(self, src: &[String]) -> Option<StatArray> {
//         let mut values = vec![];
//         for cell in src {
//             if cell.is_empty() {
//                 values.push(None)
//             } else {
//                 let val = (self)(cell).ok()?;
//                 values.push(Some(val))
//             }
//         }
//         Some(StatArray::Date { values })
//     }
// }

enum StatFormat {
    Iso8601,
    DollarAmount,
    Numeric,
    Coordinates,
}

impl StatArrayParser for StatFormat {
    fn parse(&self, src: &[String]) -> Option<StatArray> {
        lazy_static! {
            static ref RE: Regex = Regex::new(r",([0-9]{3})").unwrap();
        }

        match self {
            StatFormat::Iso8601 => {
                let mut values = vec![];
                for cell in src {
                    if cell.is_empty() {
                        values.push(None)
                    } else {
                        let val = NaiveDate::parse_from_str(cell.as_str(), "%Y-%m-%d").ok()?;
                        values.push(Some(val.and_time(NaiveTime::MIN)))
                    }
                }
                Some(StatArray::Date { values })
            }
            StatFormat::DollarAmount => {
                let mut values = vec![];
                for cell in src {
                    if cell.is_empty() {
                        values.push(None)
                    } else {
                        let cell1 = cell.as_str();
                        let (minus, cell2) = cell1
                            .strip_prefix('-')
                            .map_or((false, cell1), |s| (true, s));
                        let val = cell2
                            .strip_prefix('$')
                            .map(|s| RE.replace_all(s, "$1"))
                            .and_then(|s| s.parse().ok())
                            .map(|x: f64| if minus { -x } else { x })?;
                        values.push(Some(val))
                    }
                }
                Some(StatArray::Number {
                    unit: Some(StatUnit::Dollar),
                    values,
                })
            }
            StatFormat::Numeric => {
                let mut values = vec![];
                for cell in src {
                    if cell.is_empty() {
                        values.push(None)
                    } else {
                        let val = cell.parse().ok()?;
                        values.push(Some(val))
                    }
                }
                Some(StatArray::Number { unit: None, values })
            }
            StatFormat::Coordinates => {
                let mut values = vec![];
                for cell in src {
                    if cell.is_empty() {
                        values.push(None)
                    } else {
                        let parts: Vec<_> = cell.split(',').collect();
                        let val = match parts[..] {
                            [p1, p2] => {
                                let latitude = p1
                                    .trim()
                                    .parse()
                                    .ok()
                                    .filter(|x| *x >= -90.0 && *x <= 90.0)?;
                                let longitude = p2
                                    .trim()
                                    .parse()
                                    .ok()
                                    .filter(|x| *x >= -180.0 && *x <= 180.0)?;
                                Some((latitude, longitude))
                            }
                            _ => None,
                        }?;
                        values.push(Some(val))
                    }
                }
                Some(StatArray::LatLng { values })
            }
        }
    }
}

fn parse_stat_defs(
    stat_columns: Vec<RawColumn<'_>>,
    len: usize,
    callouts: &mut Vec<Callout>,
) -> Vec<StatDef> {
    let mut stat_defs = vec![];
    let mut labels = HashSet::new();
    let value_parsers = [
        StatFormat::Iso8601,
        StatFormat::DollarAmount,
        StatFormat::Numeric,
        StatFormat::Coordinates,
    ];
    for col in stat_columns {
        if col.body.len() > len {
            callouts.push(Callout::Warning(format!(
                "Skipping data below row {} in column {}",
                len,
                sheet_column_name(col.index)
            )))
        }
        if col.body.iter().all(|s| s.is_empty()) {
            continue;
        }
        if labels.contains(col.header) {
            callouts.push(Callout::Warning(format!(
                "Skipping stat column with duplicate label: {} ({})",
                col.header,
                sheet_column_name(col.index)
            )));
            continue;
        }
        labels.insert(col.header.clone());
        let label = col.header.clone();

        let stat_array = value_parsers
            .iter()
            .filter_map(|p| p.parse(col.body))
            .next()
            .unwrap_or_else(|| StatArray::String {
                values: col
                    .body
                    .iter()
                    .map(|s| {
                        if s.is_empty() {
                            None
                        } else {
                            Some(s.to_owned())
                        }
                    })
                    .collect(),
            });
        stat_defs.push(StatDef {
            label,
            data: stat_array,
        });
    }
    stat_defs
}

fn parse_value_range(values: Vec<Vec<String>>) -> (CardTable, Vec<Callout>) {
    let mut callouts = vec![];
    let mut card_columns: [(&str, Option<RawColumn>); 6] = [
        ("Card", None),
        ("ID", None),
        ("Disable?", None),
        ("Notes", None),
        ("Popularity", None),
        ("Category", None),
    ];
    let mut tag_columns = vec![];
    let mut stat_columns = vec![];
    for (index, col) in values.iter().enumerate() {
        if let Some((header, body)) = col.split_first() {
            let raw_column = RawColumn {
                index,
                header,
                body,
            };
            if let Some((_, prev)) = card_columns.iter_mut().find(|(name, _)| header == name) {
                if prev.is_none() {
                    let _ = prev.insert(raw_column);
                } else {
                    callouts.push(Callout::Warning(format!(
                        "Duplicate column: {} ({})",
                        header,
                        sheet_column_name(index)
                    )));
                }
            } else if header.starts_with("Tag") {
                tag_columns.push(raw_column);
            } else if !header.is_empty() {
                stat_columns.push(raw_column);
            }
        }
    }
    let named_columns = NamedColumns {
        title: card_columns[0].1,
        unique_id: card_columns[1].1,
        is_disabled: card_columns[2].1,
        notes: card_columns[3].1,
        popularity: card_columns[4].1,
        category: card_columns[5].1,
    };
    let cards = parse_cards(named_columns, &mut callouts);
    let tag_defs = parse_tag_defs(tag_columns, cards.len(), &mut callouts);
    let stat_defs = parse_stat_defs(stat_columns, cards.len(), &mut callouts);
    let card_table = CardTable {
        cards,
        tag_defs,
        stat_defs,
    };
    (card_table, callouts)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ValueRange {
    #[allow(dead_code)]
    range: String,
    major_dimension: String,
    values: Vec<Vec<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Spreadsheet {
    spreadsheet_id: String,
    value_ranges: Vec<ValueRange>,
}

error_chain! {
    foreign_links {
        DeserializationError(serde_json::Error);
    }

    errors {
        BadMajorDimension {
            description("Major dimension must be \"COLUMNS\"")
        }
        WrongNumberOfRanges {
            description("Expected one ValueRange for each sheet name")
        }
    }
}

pub fn parse_spreadsheet(sheet_names: Vec<String>, json: String) -> Result<Vec<AnnotatedDeck>> {
    let spreadsheet: Spreadsheet =
        serde_json::from_slice(json.as_bytes()).map_err(ErrorKind::DeserializationError)?;
    if spreadsheet.value_ranges.len() != sheet_names.len() {
        return Err(ErrorKind::WrongNumberOfRanges.into());
    }
    if spreadsheet
        .value_ranges
        .iter()
        .any(|e| e.major_dimension != "COLUMNS")
    {
        return Err(ErrorKind::BadMajorDimension.into());
    }
    let mut annotated_decks = vec![];
    for (nm, vr) in sheet_names
        .into_iter()
        .zip(spreadsheet.value_ranges.into_iter())
    {
        let (card_table, callouts) = parse_value_range(vr.values);
        let deck = Deck {
            id: annotated_decks.len() as u64,
            revision: 0,
            title: nm,
            spreadsheet_id: spreadsheet.spreadsheet_id.clone(),
            data: card_table,
        };
        annotated_decks.push(AnnotatedDeck { deck, callouts });
    }
    Ok(annotated_decks)
}

#[cfg(test)]
mod tests {
    use chrono::NaiveDate;

    use crate::{
        importer::parse_value_range,
        types::{Card, CardTable, StatArray, StatUnit},
    };

    fn movies_row_major() -> Vec<Vec<String>> {
        let sheet = r#"[
        [ "Card",                   "ID",                   "Disable?", "Notes", "Popularity", "Category", "TagActors",                                                                                  "TagCharacters",                                                                       "Num Theaters", "Box Office", "Release Date"],
        [ "The Matrix",             "TheMatrix",            "",         "",      "99",         "Action",   "Keanu Reeves, Carrie-Anne Moss, Laurence Fishburne, Hugo Weaving, Emil Eifrem",              "Neo, Trinity, Morpheus, Agent Smith, Emil",                                           "3084",         "$1,602,000", "1999-06-23"],
        [ "The Matrix Reloaded",    "TheMatrixReloaded",    "",         "",      "73",         "Action",   "Keanu Reeves, Carrie-Anne Moss, Laurence Fishburne, Hugo Weaving",                           "Neo, Trinity, Morpheus, Agent Smith",                                                 "2794",         "$1,138,000", "2003-01-26"],
        [ "The Matrix Revolutions", "TheMatrixRevolutions", "y",        "setoN", "62",         "Action",   "Keanu Reeves, Carrie-Anne Moss, Laurence Fishburne, Hugo Weaving",                           "Neo, Trinity, Morpheus, Agent Smith",                                                 "3144",         "$1,282,000", "2003-06-01"],
        [ "The Devil's Advocate",   "TheDevilsAdvocate",    "",         "",      "16",         "Drama",    "Keanu Reeves, Charlize Theron, Al Pacino",                                                   "Kevin Lomax, Mary Ann Lomax, John Milton",                                            "2905",         "$1,088,000", "1997-09-21"],
        [ "A Few Good Men",         "AFewGoodMen",          "",         "",      "43",         "Drama",    "Tom Cruise, Jack Nicholson, Demi Moore, Kevin Bacon, Kiefer Sutherland, Noah Wyle",          "Lt. Daniel Kaffee, Col. Nathan R. Jessup, Lt. Cdr. JoAnne Galloway, Capt. Jack Ross", "3123",         "$6,617,000", "1992-06-26"],
        [ "Top Gun",                "TopGun",               "",         "",      "65",         "Action",   "Tom Cruise, Kelly McGillis, Val Kilmer, Anthony Edwards, Tom Skerritt, Meg Ryan",            "Maverick, Charlie, Iceman, Goose, Viper, Carole",                                     "3060",         "$3,677,000", "1986-07-05"],
        [ "Jerry Maguire",          "JerryMaguire",         "",         "",      "38",         "Drama",    "Tom Cruise, Cuba Gooding Jr., Renee Zellweger, Kelly Preston, Jerry O'Connell, Jay Mohr",    "Jerry Maguire, Rod Tidwell, Dorothy Boyd, Avery Bishop, Frank Cushman, Bob Sugar",    "3187",         "$1,696,000", "2000-06-23"],
        [ "Stand By Me",            "StandByMe",            "",         "",      "88",         "Action",   "Wil Wheaton, River Phoenix, Jerry O'Connell, Corey Feldman, John Cusack, Kiefer Sutherland", "Gordie Lachance, Chris Chambers, Vern Tessio, Teddy Duchamp, Denny Lachance",         "2989",         "$5,691,000", "1986-12-22"],
        [ "As Good as It Gets",     "AsGoodAsItGets",       "",         "",      "57",         "Drama",    "Jack Nicholson, Helen Hunt, Greg Kinnear, Cuba Gooding Jr.",                                 "Melvin Udall, Carol Connelly, Simon Bishop, Frank Sachs",                             "2936",         "$2,005,000", "1997-01-10"],
        [ "What Dreams May Come",   "WhatDreamsMayCome",    "",         "",      "44",         "Action",   "Robin Williams, Cuba Gooding Jr., Annabella Sciorra, Max von Sydow, Werner Herzog",          "Chris Nielsen, Albert Lewis, Annie Collins-Nielsen, The Tracker, The Face",           "2731",         "$7,036,000", "1998-06-08"],
        [ "You've Got Mail",        "YouveGotMail",         "",         "",      "34",         "Drama",    "Tom Hanks, Meg Ryan, Greg Kinnear, Parker Posey, Dave Chappelle, Steve Zahn",                "Joe Fox, Kathleen Kelly, Frank Navasky, Patricia Eden, Kevin Jackson, George Pappas", "3026",         "$1,796,000", "1998-08-24"],
        [ "Sleepless in Seattle",   "SleeplessInSeattle",   "",         "",      "41",         "Action",   "Tom Hanks, Meg Ryan, Rita Wilson, Bill Pullman, Victor Garber, Rosie O'Donnell",             "Sam Baldwin, Annie Reed, Suzy, Walter, Greg, Becky",                                  "2716",         "$9,419,000", "1993-04-14"],
        [ "Joe Versus the Volcano", "JoeVersustheVolcano",  "",         "",      "44",         "Comedy",   "Tom Hanks, Meg Ryan, Nathan Lane",                                                           "Joe Banks, DeDe, Angelica Graynamore, Patricia Graynamore, Baw",                      "2789",         "$1,597,000", "1990-05-15"],
        [ "When Harry Met Sally",   "WhenHarryMetSally",    "",         "",      "56",         "Action",   "Billy Crystal, Meg Ryan, Carrie Fisher, Bruno Kirby",                                        "Harry Burns, Sally Albright, Marie, Jess",                                            "2919",         "$5,532,000", "1998-10-15"],
        [ "Snow Falling on Cedars", "SnowFallingonCedars",  "n",        "",      "82",         "",         "",                                                                                           "",                                                                                    "",             "",           ""]
        ]"#;
        // Snow Falling on Cedars", "SnowFallingonCedars",  "",        "",      "82",         "",         "Ethan Hawke, Rick Yune, Max von Sydow, James Cromwell",                                      "Ishmael Chambers, Kazuo Miyamoto, Nels Gudmundsson, Judge Fielding",                  "2718",         "$7,829,000", "1999-11-14"]
        serde_json::from_str(sheet).unwrap()
    }

    fn transpose<I: IntoIterator<Item = Vec<String>>>(src: I) -> Vec<Vec<String>> {
        let mut result = vec![];
        for row in src {
            for (index, cell) in row.into_iter().enumerate() {
                while result.len() <= index {
                    result.push(vec![]);
                }
                result.get_mut(index).unwrap().push(cell);
            }
        }
        result
    }

    fn movies() -> Vec<Vec<String>> {
        transpose(movies_row_major())
    }

    #[test]
    fn test_parse_value_range_empty_input() {
        assert_eq!(parse_value_range(vec![]), (CardTable::default(), vec![]))
    }

    #[test]
    fn test_parse_value_range_of_only_headers() {
        let mut frame = movies_row_major();
        frame.truncate(1);
        let input = transpose(frame);
        assert_eq!(parse_value_range(input), (CardTable::default(), vec![]))
    }

    #[test]
    fn test_parse_value_range_of_movies() {
        let (card_table, callouts) = parse_value_range(movies());
        assert_eq!(callouts, vec![]);
        assert_eq!(card_table.cards.len(), 15);
        assert_eq!(
            card_table.cards[0],
            Card {
                title: "The Matrix".into(),
                unique_id: Some("TheMatrix".into()),
                is_disabled: false,
                notes: None,
                popularity: 99.0,
                category: Some("Action".into())
            }
        );
        assert_eq!(
            card_table.cards[2],
            Card {
                title: "The Matrix Revolutions".into(),
                unique_id: Some("TheMatrixRevolutions".into()),
                is_disabled: true,
                notes: Some("setoN".into()),
                popularity: 62.0,
                category: Some("Action".into())
            }
        );
        assert_eq!(
            card_table.cards[14],
            Card {
                title: "Snow Falling on Cedars".into(),
                unique_id: Some("SnowFallingonCedars".into()),
                is_disabled: false,
                notes: None,
                popularity: 82.0,
                category: None,
            }
        );

        assert_eq!(card_table.tag_defs.len(), 2);
        assert_eq!(card_table.tag_defs[0].label, "TagActors");
        assert_eq!(card_table.tag_defs[1].label, "TagCharacters");
        assert_eq!(
            card_table.tag_defs[0].values[0][..],
            [
                "Keanu Reeves",
                "Carrie-Anne Moss",
                "Laurence Fishburne",
                "Hugo Weaving",
                "Emil Eifrem"
            ]
        );
        let nothing: [&str; 0] = [];
        assert_eq!(card_table.tag_defs[0].values[14][..], nothing);
        assert_eq!(
            card_table.tag_defs[1].values[0][..],
            ["Neo", "Trinity", "Morpheus", "Agent Smith", "Emil"]
        );
        assert_eq!(card_table.tag_defs[1].values[14][..], nothing);

        assert_eq!(card_table.stat_defs.len(), 3);
        assert_eq!(card_table.stat_defs[0].label, "Num Theaters");
        assert_eq!(card_table.stat_defs[1].label, "Box Office");
        assert_eq!(card_table.stat_defs[2].label, "Release Date");
        match &card_table.stat_defs[0].data {
            StatArray::Number { unit: None, values } => {
                assert_eq!(values[0], Some(3084.0));
                assert_eq!(values[14], None);
            }
            other => assert!(false, "unexpected stat type: {:?}", other),
        };
        match &card_table.stat_defs[1].data {
            StatArray::Number { unit: Some(StatUnit::Dollar), values } => {
                assert_eq!(values[0], Some(1_602_000.0));
                assert_eq!(values[14], None);
            }
            other => assert!(false, "unexpected stat type: {:?}", other),
        };
        match &card_table.stat_defs[2].data {
            StatArray::Date { values } => {
                assert_eq!(
                    values[0],
                    Some(
                        NaiveDate::from_ymd_opt(1999, 6, 23)
                            .unwrap()
                            .and_hms_micro_opt(0, 0, 0, 0)
                            .unwrap()
                    )
                );
                assert_eq!(values[14], None);
            }
            other => assert!(false, "unexpected stat type: {:?}", other),
        };
    }
}
