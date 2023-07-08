use std::cmp::Ordering;

use error_chain::error_chain;

use crate::types::Deck;

mod engine;
mod hangman;
mod multiple_choice;
mod ranking;
mod types;

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

#[cfg(test)]
mod tests {
    use rstest::fixture;

    use crate::{types::Deck, importer};

    use super::scale_popularity;

    #[fixture]
    #[once]
    pub fn decks() -> Vec<Deck> {
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
}