use std::{collections::HashMap, num::TryFromIntError};

use crate::{tinylang::{OwnedExprValue, self}, trivia::types::TriviaExp};

use super::{
    engine::{Select, TriviaGen},
    types::{
        selectors, ActiveDeck, GradeableTrivia, SanityCheck, Trivia, TriviaAnswer,
        TriviaAnswerType, TriviaDefCommon,
    },
    ErrorKind, Result,
};

pub struct HangmanCommon {
    pub lives: u8,
}

impl SanityCheck for HangmanCommon {
    type Error = super::Error;

    fn sanity_check(&self) -> std::result::Result<(), Self::Error> {
        Ok(())
    }
}

pub enum HangmanDef {
    Card {
        selector: selectors::Stat,
        params: HangmanCommon,
    },
    Stat {
        selector: selectors::Stat,
        params: HangmanCommon,
    },
}

impl Trivia {
    pub fn new_hangman(
        question: String,
        options: Vec<TriviaAnswer>,
        prefilled_answers: Vec<TriviaAnswer>,
    ) -> Self {
        Self {
            question,
            answer_type: TriviaAnswerType::Hangman,
            min_answers: 1,
            max_answers: 1,
            question_value_type: tinylang::ExprType::IntArray,
            stat_annotation: None,
            options,
            prefilled_answers,
        }
    }
}

type HangmanTriple = (Vec<TriviaAnswer>, Vec<TriviaAnswer>, Vec<TriviaExp>);

fn single_uppercase(c: char) -> char {
    let cx: Vec<_> = c.to_uppercase().collect();
    match &cx[..] {
        &[cu] => cu,
        _ => c,
    }
}

fn transform_hangman(
    answer_str: &str,
    params: &HangmanCommon,
) -> std::result::Result<HangmanTriple, TryFromIntError> {
    let mut answer_map: HashMap<_, _> = ('A'..='Z')
        .enumerate()
        .map(|(id, c)| {
            let positions: Vec<i64> = vec![];
            (c, (id, positions))
        })
        .collect();
    for (pos, c) in answer_str.chars().enumerate() {
        let l = answer_map.len();
        answer_map
            .entry(single_uppercase(c))
            .and_modify(|(_, positions)| positions.push(pos as i64))
            .or_insert((l, vec![pos as i64]));
    }
    let mut answers = vec![];
    let mut prefilled_answers = vec![];
    let mut ids_f = vec![];
    let mut ids_t = vec![];
    for (c, (id, positions)) in answer_map {
        let id: u8 = id.try_into()?;
        let is_empty = positions.is_empty();
        let ans = TriviaAnswer {
            id,
            answer: c.to_string(),
            question_value: positions.into(),
        };
        if c.is_ascii_uppercase() {
            answers.push(ans);
        } else {
            prefilled_answers.push(ans);
        }
        if is_empty {
            ids_f.push(id);
        } else {
            ids_t.push(id);
        }
    }
    let expectations = vec![
        TriviaExp::All { ids: ids_t },
        TriviaExp::NoneLenient {
            ids: ids_f,
            max: params.lives,
        },
    ];
    Ok((answers, prefilled_answers, expectations))
}

impl TriviaGen for HangmanDef {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia> {
        match self {
            HangmanDef::Card { selector, params } => {
                let (card_index, stat) = selector
                    .select(deck, &[])
                    .ok_or_else(|| ErrorKind::NotEnoughData(1))?;
                let card_title = &deck.data.cards[card_index].title;
                let (answers, prefilled, expectations) = transform_hangman(card_title, params)
                    .map_err(|_| {
                        ErrorKind::Msg("card title has more than 255 distinct symbols".into())
                    })?;
                let hint = match stat.value {
                    OwnedExprValue::StringArray(v) => v.join(", "),
                    OwnedExprValue::String(v) => v,
                    _ => panic!(
                        "HangmanDef::Card: selector must have return type String or StringArray"
                    ),
                };
                let question = common.question_format.replace("{}", &hint);
                let trivia = Trivia::new_hangman(question, answers, prefilled);
                Ok((trivia, expectations))
            }
            HangmanDef::Stat { selector, params } => {
                let (card_index, stat) = selector
                    .select(deck, &[])
                    .ok_or_else(|| ErrorKind::NotEnoughData(1))?;
                let answer_str = match stat.value {
                    OwnedExprValue::String(v) => v,
                    _ => panic!("HangmanDef::Stat: selector must have return type String"),
                };
                let (answers, prefilled, expectations) = transform_hangman(&answer_str, params)
                    .map_err(|_| {
                        ErrorKind::Msg("card title has more than 255 distinct chars".into())
                    })?;
                let card_title = &deck.data.cards[card_index].title;
                let question = common.question_format.replace("{}", card_title);
                let trivia = Trivia::new_hangman(question, answers, prefilled);
                Ok((trivia, expectations))
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::io::Write;

    use super::*;
    use crate::{
        tinylang::{expr, ExprType},
        trivia::tests::decks,
        types::Deck,
    };
    use rstest::rstest;

    #[rstest]
    fn test_card(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks.iter().cloned().map(ActiveDeck::new).collect();
        let definition = HangmanDef::Card {
            selector: selectors::Stat {
                difficulty: -0.5,
                expression: expr("R\"Description\"").unwrap(),
                return_type: ExprType::String,
            },
            params: HangmanCommon { lives: 1 },
        };
        let common = TriviaDefCommon {
            deck_id: 3,
            question_format: "Who is this: {}".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[3], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[3], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_stat(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks.iter().cloned().map(ActiveDeck::new).collect();
        let definition = HangmanDef::Stat {
            selector: selectors::Stat {
                difficulty: -0.5,
                expression: expr("R\"Capital\"").unwrap(),
                return_type: ExprType::String,
            },
            params: HangmanCommon { lives: 1 },
        };
        let common = TriviaDefCommon {
            deck_id: 4,
            question_format: "What is the capital of {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[4], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[4], &common)?;
        }
        Ok(())
    }
}
