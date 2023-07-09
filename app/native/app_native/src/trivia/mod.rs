use std::cmp::Ordering;

use error_chain::error_chain;

use crate::{
    tinylang::{self, expr},
    trivia::types::SanityCheck,
    types::Deck,
};

mod engine;
mod hangman;
mod multiple_choice;
mod ranking;
mod types;

pub use types::{
    ActiveDeck, ActivePairing, GradeableTrivia, QValue, Trivia, TriviaAnswer, TriviaAnswerType,
    TriviaDefCommon, TriviaExp,
};

use self::{
    hangman::{HangmanCommon, HangmanDef},
    multiple_choice::{MultipleChoiceCommon, MultipleChoiceDef},
    ranking::{RankingCommon, RankingDef},
    types::selectors,
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
        deck.data.cards.iter_mut().for_each(|c| {
            // fixed: pop - pop_min could be < 0 since min is calculated on enabled cards only
            c.popularity = ((c.popularity - pop_min).max(0.0) / pop_range).powf(curve_factor)
        })
    }
}

error_chain! {
    foreign_links {
        DeserializationError(serde_json::Error);
    }

    errors {
        // insert-time
        InvalidDeckId(id: u64) {
            description("invalid Deck id")
            display("invalid Deck id: {}", id)
        }
        InvalidTagName(nm: String) {
            description("invalid Tag name")
            display("invalid Tag name: {}", nm)
        }
        InvalidPairingName(nm: String) {
            description("invalid Pairing name")
            display("invalid Pairing name: {}", nm)
        }
        TinylangSyntaxError(src: String, msg: String) {
            description("syntax error")
            display("syntax error in {:?}: {}", src, msg)
        }
        TinylangTypeError(src: String, msg: String) {
            description("type error")
            display("type error in {:?}: {}", src, msg)
        }
        // generation-time
        NotEnoughData(c: u8) {
            description("not enough data")
            display("expected at least {} valid item(s) for TriviaDef", c)
        }
        NotPlural {
            description("a card can only have 1 stat in a particular column")
        }
    }
}

pub struct KnowledgeBase {
    pub decks: Vec<ActiveDeck>,
    pub trivia_defs: Vec<TriviaDef>,
}

impl KnowledgeBase {
    fn get_deck(&self, deck_id: u64) -> Option<&ActiveDeck> {
        self.decks.iter().find(|d| d.id == deck_id)
    }
}

pub enum TriviaDef {
    MultipleChoice(MultipleChoiceDef, TriviaDefCommon),
    Ranking(RankingDef, TriviaDefCommon),
    Hangman(HangmanDef, TriviaDefCommon),
}

impl TriviaDef {
    fn _deck<'a>(base: &'a KnowledgeBase, deck_id: u64) -> Result<&'a ActiveDeck> {
        let deck = base
            .get_deck(deck_id)
            .ok_or_else(|| ErrorKind::InvalidDeckId(deck_id))?;
        Ok(deck)
    }

    fn _expression_exprtype(
        deck: &ActiveDeck,
        expr_src: &str,
    ) -> Result<(tinylang::Expression, tinylang::ExprType)> {
        let expression =
            expr(expr_src).map_err(|msg| ErrorKind::TinylangSyntaxError(expr_src.into(), msg))?;
        let return_type = expression
            .optimize(&deck.data, &deck.data)
            .map_err(|msg| ErrorKind::TinylangTypeError(expr_src.into(), msg))?
            .get_type()
            .map_err(|msg| ErrorKind::TinylangTypeError(expr_src.into(), msg))?;
        Ok((expression, return_type))
    }

    pub fn create_multiple_choice_card_stat(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: MultipleChoiceCommon,
        difficulties: (f64,),
        same_category: bool,
        stat_expr_src: &str,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let (stat_expr, return_type) = Self::_expression_exprtype(deck, stat_expr_src)?;
        if !matches!(return_type, tinylang::ExprType::String) {
            return Err(ErrorKind::Msg(format!(
                "expected String expression, got {:?}",
                return_type
            ))
            .into());
        }
        let left = if same_category {
            Some(selectors::Category { difficulty: 0.0 })
        } else {
            None
        };
        let right = selectors::Stat {
            difficulty: difficulties.0,
            expression: stat_expr,
            return_type,
        };
        let body = MultipleChoiceDef::CardStat {
            left,
            right,
            params,
        };
        Ok(TriviaDef::MultipleChoice(body, common))
    }

    pub fn create_multiple_choice_card_tag(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: MultipleChoiceCommon,
        difficulties: (f64, f64),
        tag_name: &str,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let tag_id = deck
            .get_tag_index(tag_name)
            .ok_or_else(|| ErrorKind::InvalidTagName(tag_name.into()))?;
        let left = selectors::Card {
            difficulty: difficulties.0,
            stats: vec![],
        };
        let right = selectors::Tag {
            difficulty: difficulties.1,
            which: tag_id,
        };
        let body = MultipleChoiceDef::CardTag {
            left,
            right,
            params,
        };
        Ok(TriviaDef::MultipleChoice(body, common))
    }

    pub fn create_multiple_choice_tag_card(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: MultipleChoiceCommon,
        difficulties: (f64, f64),
        tag_name: &str,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let tag_id = deck
            .get_tag_index(tag_name)
            .ok_or_else(|| ErrorKind::InvalidTagName(tag_name.into()))?;
        let left = selectors::Tag {
            difficulty: difficulties.0,
            which: tag_id,
        };
        let right = selectors::Card {
            difficulty: difficulties.1,
            stats: vec![],
        };
        let body = MultipleChoiceDef::TagCard {
            left,
            right,
            params,
        };
        Ok(TriviaDef::MultipleChoice(body, common))
    }

    pub fn create_multiple_choice_pairing(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: MultipleChoiceCommon,
        difficulties: (f64, f64),
        pairing_name: &str,
        maybe_predicate_src: Option<&str>,
        separator: char,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let predicate = if let Some(predicate_src) = maybe_predicate_src {
            let (expression, return_type) = Self::_expression_exprtype(deck, predicate_src)?;
            if !matches!(return_type, tinylang::ExprType::Bool) {
                return Err(ErrorKind::Msg(format!(
                    "expected Bool expression, got {:?}",
                    return_type
                ))
                .into());
            }
            Some(expression)
        } else {
            None
        };
        let pairing_id = deck
            .get_pairing_index(pairing_name)
            .ok_or_else(|| ErrorKind::InvalidPairingName(pairing_name.into()))?;
        let left = selectors::Card {
            difficulty: difficulties.0,
            stats: vec![],
        };
        let right = selectors::Card {
            difficulty: difficulties.1,
            stats: vec![],
        };
        let body = MultipleChoiceDef::Pairing {
            left,
            right,
            separator,
            pairing_id,
            predicate,
            params,
        };
        Ok(TriviaDef::MultipleChoice(body, common))
    }

    pub fn create_ranking_card(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: RankingCommon,
        difficulties: (f64,),
        same_category: bool,
        stat_expr_src: &str,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let (stat_expr, return_type) = Self::_expression_exprtype(deck, stat_expr_src)?;
        if !matches!(
            return_type,
            tinylang::ExprType::Number | tinylang::ExprType::Date
        ) {
            return Err(ErrorKind::Msg(format!(
                "expected Number or Date expression, got {:?}",
                return_type
            ))
            .into());
        }
        let left = if same_category {
            Some(selectors::Category { difficulty: 0.0 })
        } else {
            None
        };
        let right = selectors::Stat {
            difficulty: difficulties.0,
            expression: stat_expr,
            return_type,
        };
        let body = RankingDef::Card {
            left,
            right,
            params,
        };
        Ok(TriviaDef::Ranking(body, common))
    }

    pub fn create_ranking_card_squared(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: RankingCommon,
        difficulties: (f64, f64),
        stat_expr_src: &str,
        separator: char,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let (stat_expr, return_type) = Self::_expression_exprtype(deck, stat_expr_src)?;
        if !matches!(
            return_type,
            tinylang::ExprType::Number | tinylang::ExprType::Date
        ) {
            return Err(ErrorKind::Msg(format!(
                "expected Number or Date expression, got {:?}",
                return_type
            ))
            .into());
        }
        let left = selectors::Card {
            difficulty: difficulties.0,
            stats: vec![],
        };
        let right = selectors::Card {
            difficulty: difficulties.1,
            stats: vec![],
        };
        let stat = selectors::StatNested {
            expression: stat_expr,
            return_type,
        };
        let body = RankingDef::CardCard {
            left,
            right,
            stat,
            separator,
            params,
        };
        Ok(TriviaDef::Ranking(body, common))
    }

    pub fn create_hangman_card(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: HangmanCommon,
        difficulties: (f64,),
        stat_expr_src: &str,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let (stat_expr, return_type) = Self::_expression_exprtype(deck, stat_expr_src)?;
        if !matches!(
            return_type,
            tinylang::ExprType::String | tinylang::ExprType::StringArray
        ) {
            return Err(ErrorKind::Msg(format!(
                "expected String or StringArray expression, got {:?}",
                return_type
            ))
            .into());
        }
        let selector = selectors::Stat {
            difficulty: difficulties.0,
            expression: stat_expr,
            return_type,
        };
        let body = HangmanDef::Card { selector, params };
        Ok(TriviaDef::Hangman(body, common))
    }

    pub fn create_hangman_stat(
        base: &KnowledgeBase,
        common: TriviaDefCommon,
        params: HangmanCommon,
        difficulties: (f64,),
        stat_expr_src: &str,
    ) -> Result<Self> {
        params.sanity_check()?;
        let deck = Self::_deck(base, common.deck_id)?;
        let (stat_expr, return_type) = Self::_expression_exprtype(deck, stat_expr_src)?;
        if !matches!(return_type, tinylang::ExprType::String) {
            return Err(ErrorKind::Msg(format!(
                "expected String expression, got {:?}",
                return_type
            ))
            .into());
        }
        let selector = selectors::Stat {
            difficulty: difficulties.0,
            expression: stat_expr,
            return_type,
        };
        let body = HangmanDef::Stat { selector, params };
        Ok(TriviaDef::Hangman(body, common))
    }
}

pub fn seed(base: &mut KnowledgeBase) -> Result<()> {
    let trivia_def = TriviaDef::create_multiple_choice_tag_card(
        base,
        TriviaDefCommon {
            deck_id: 6,
            question_format: "Which movie was directed by {}?".into(),
        },
        MultipleChoiceCommon::typical(4),
        (0.0, -1.5),
        "Director",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_multiple_choice_card_tag(
        base,
        TriviaDefCommon {
            deck_id: 6,
            question_format: "Who directed {}?".into(),
        },
        MultipleChoiceCommon::typical(4),
        (0.0, -1.0),
        "Director",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 6,
            question_format: "Rank these {} movies from highest to lowest Letterboxd rating."
                .into(),
        },
        RankingCommon {
            is_asc: false,
            is_single: false,
            total: 3,
        },
        (-1.5,),
        true,
        "R\"Letterboxd rating\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 4,
            question_format: "Rank these songs from most to least Spotify plays.".into(),
        },
        RankingCommon {
            is_asc: true,
            is_single: false,
            total: 3,
        },
        (-0.75,),
        true,
        "R\"Spotify plays\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 3,
            question_format: "Rank these people from most to least popular on Wikipedia.".into(),
        },
        RankingCommon {
            is_asc: false,
            is_single: false,
            total: 3,
        },
        (-1.625,),
        true,
        "R\"Wikipedia views\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 3,
            question_format: "Rank these people from oldest to youngest.".into(),
        },
        RankingCommon {
            is_asc: true,
            is_single: false,
            total: 3,
        },
        (-1.625,),
        true,
        "R\"Birth date\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_multiple_choice_pairing(
        base,
        TriviaDefCommon {
            deck_id: 3,
            question_format: "Pick the fake couple.".into(),
        },
        MultipleChoiceCommon {
            min_true: 3,
            max_true: 3,
            total: 4,
            is_inverted: true,
        },
        (0.0, -1.0),
        "Couple",
        Some("L\"Card\" != R\"Card\" and L\"Pronoun\" == R\"Partner pronoun\" and R\"Pronoun\" == L\"Partner pronoun\""),
        '+',
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_hangman_card(
        base,
        TriviaDefCommon {
            deck_id: 3,
            question_format: "Who is this:\n{}".into(),
        },
        HangmanCommon { lives: 1 },
        (-1.0,),
        "R\"Description\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 2,
            question_format: "Rank these places from most to least popular on Wikipedia.".into(),
        },
        RankingCommon {
            is_asc: false,
            is_single: false,
            total: 3,
        },
        (-2.25,),
        true,
        "R\"Wikipedia views\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 2,
            question_format: "Rank these places by population (highest first).".into(),
        },
        RankingCommon {
            is_asc: false,
            is_single: false,
            total: 3,
        },
        (-1.625,),
        true,
        "R\"Population\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card_squared(
        base,
        TriviaDefCommon {
            deck_id: 2,
            question_format: "Pick the closest pair of cities geographically.".into(),
        },
        RankingCommon {
            is_asc: false,
            is_single: false,
            total: 3,
        },
        (-1.25, -1.25),
        "L\"Coordinates\" <-> R\"Coordinates\"",
        '↔',
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_hangman_stat(
        base,
        TriviaDefCommon {
            deck_id: 2,
            question_format: "What is the capital of {}?".into(),
        },
        HangmanCommon { lives: 1 },
        (-1.0,),
        "R\"Capital\"",
    )?;
    base.trivia_defs.push(trivia_def);
    let trivia_def = TriviaDef::create_ranking_card(
        base,
        TriviaDefCommon {
            deck_id: 1,
            question_format: "Rank these characters from most to fewest fanfiction works on AO3."
                .into(),
        },
        RankingCommon {
            is_asc: true,
            is_single: false,
            total: 3,
        },
        (-1.75,),
        true,
        "R\"AO3 fanfics\"",
    )?;
    base.trivia_defs.push(trivia_def);
    Ok(())
}

#[cfg(test)]
mod tests {
    use rstest::fixture;

    use crate::{importer, types::Deck};

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
