use smallvec::SmallVec;

use crate::{
    probability::Blend,
    tinylang::{self, OwnedExprValue},
    trivia::types::TriviaExp,
};

use super::{
    engine::{CardCond, Select, TagCond, TriviaGen},
    types::{
        selectors, ActiveDeck, GradeableTrivia, QValue, Trivia, TriviaAnswer, TriviaAnswerType,
        TriviaDefCommon,
    },
    ErrorKind, Result,
};

pub struct MultipleChoiceCommon {
    min_true: u8,
    max_true: u8,
    total: u8,
    is_inverted: bool,
}

impl MultipleChoiceCommon {
    fn min_false(&self) -> u8 {
        self.total - self.max_true
    }

    fn max_false(&self) -> u8 {
        self.total - self.min_true
    }

    fn min_answers(&self) -> u8 {
        if self.is_inverted {
            self.min_false()
        } else {
            self.min_true
        }
    }

    fn max_answers(&self) -> u8 {
        if self.is_inverted {
            self.max_false()
        } else {
            self.max_true
        }
    }
}

pub enum MultipleChoiceDef {
    CardStat {
        left: Option<selectors::Category>,
        right: selectors::Stat,
        params: MultipleChoiceCommon,
    },
    CardTag {
        left: selectors::Card,
        right: selectors::Tag,
        params: MultipleChoiceCommon,
    },
    TagCard {
        left: selectors::Tag,
        right: selectors::Card,
        params: MultipleChoiceCommon,
    },
    Pairing {
        left: selectors::Card,
        right: selectors::Card,
        separator: char,
        pairing_id: usize,
        /// Will be satisfied by incorrect answers, which also must not be in
        /// the pairing
        predicate: Option<tinylang::Expression>,
        // TODO boost
        params: MultipleChoiceCommon,
    },
}

impl<T> Trivia<T> {
    pub fn new_selection(
        params: &MultipleChoiceCommon,
        question: String,
        question_value_type: &str,
        options: Vec<TriviaAnswer<T>>,
    ) -> Self {
        Self {
            question,
            answer_type: TriviaAnswerType::Selection,
            min_answers: params.min_answers(),
            max_answers: params.max_answers(),
            question_value_type: question_value_type.into(),
            options,
            prefilled_answers: vec![],
        }
    }
}

fn transform_multiple_choice<E, F>(
    answers_t: Vec<E>,
    answers_f: Vec<E>,
    params: &MultipleChoiceCommon,
    fun: F,
) -> (Vec<TriviaAnswer<QValue>>, Vec<TriviaExp>)
where
    F: Fn(u8, E) -> TriviaAnswer<QValue>,
{
    let mut ids_t = vec![];
    let mut ids_f = vec![];
    let mut answers = vec![];
    for (id, (t, inst)) in answers_t
        .into_iter()
        .blend(answers_f, params.min_true.into(), params.min_false().into())
        .enumerate()
    {
        if t == params.is_inverted {
            ids_f.push(id as u8);
        } else {
            ids_t.push(id as u8);
        }
        answers.push(fun(id as u8, inst))
    }
    let expectations = vec![
        TriviaExp::All { ids: ids_t },
        TriviaExp::None { ids: ids_f },
    ];
    (answers, expectations)
}

impl TriviaGen for MultipleChoiceDef {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia> {
        match self {
            MultipleChoiceDef::CardStat {
                left,
                right,
                params,
            } => {
                if params.min_true != 1 || params.max_true != 1 {
                    return Err(ErrorKind::NotPlural.into());
                }
                let cat = match left {
                    Some(sel) => Some(
                        sel.select(deck, &[])
                            .ok_or_else(|| ErrorKind::NotEnoughData(1))?,
                    ),
                    None => None,
                };
                let conds: Vec<_> = cat
                    .iter()
                    .map(|inst| CardCond::Category(inst.clone()))
                    .collect();
                let mut answers = right.select_n(deck, &conds, params.total.into());
                if answers.len() < params.total.into() {
                    return Err(ErrorKind::NotEnoughData(params.total).into());
                }
                let subj = answers.pop().ok_or_else(|| ErrorKind::NotEnoughData(1))?;

                let (answers, expectations) = transform_multiple_choice(
                    vec![subj.clone()],
                    answers,
                    params,
                    |id, (idx, inst)| {
                        let answer = match inst.value {
                            OwnedExprValue::String(v) => v,
                            _ => panic!(
                                "MultipleChoiceDef::CardStat: right must have return type String"
                            ),
                        };
                        TriviaAnswer {
                            id,
                            answer,
                            question_value: deck.data.cards[idx].title.clone().into(),
                        }
                    },
                );
                let card_title = deck.data.cards[subj.0].title.as_str();
                let question = common.question_format.replace("{}", card_title);
                let trivia = Trivia::new_selection(params, question, "string", answers);
                Ok((trivia, expectations))
            }
            MultipleChoiceDef::CardTag {
                left,
                right,
                params,
            } => {
                let subj = left
                    .select(deck, &[CardCond::TagOut(right.which)])
                    .ok_or_else(|| ErrorKind::NotEnoughData(1))?;
                let answers_t =
                    right.select_n(deck, &[TagCond::Edge(subj.index)], params.max_true.into());
                if answers_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let answers_f = right.select_n(
                    deck,
                    &[TagCond::NoEdge(subj.index)],
                    params.max_false().into(),
                );
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, inst| {
                        TriviaAnswer {
                            id,
                            answer: inst.value,
                            // TODO lookup tag->cards
                            question_value: OwnedExprValue::StringArray(SmallVec::new()).into(),
                        }
                    });
                let card_title = &deck.data.cards[subj.index].title;
                let question = common.question_format.as_str().replace("{}", card_title);
                let trivia = Trivia::new_selection(params, question, "string[]", answers);
                Ok((trivia, expectations))
            }
            MultipleChoiceDef::TagCard {
                left,
                right,
                params,
            } => {
                let subj = left
                    .select(deck, &[])
                    .ok_or_else(|| ErrorKind::NotEnoughData(1))?;
                let answers_t =
                    right.select_n(deck, &[CardCond::Tag(subj.clone())], params.max_true.into());
                if answers_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let answers_f = right.select_n(
                    deck,
                    &[CardCond::NoTag(subj.clone())],
                    params.max_false().into(),
                );
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, inst| {
                        TriviaAnswer {
                            id,
                            answer: deck.data.cards[inst.index].title.clone(),
                            question_value: deck.data.tag_defs[left.which].values[inst.index]
                                .clone()
                                .into(),
                        }
                    });
                let question = common.question_format.replace("{}", &subj.value);
                let trivia = Trivia::new_selection(params, question, "string[]", answers);
                Ok((trivia, expectations))
            }
            MultipleChoiceDef::Pairing {
                left,
                right,
                separator,
                pairing_id,
                predicate,
                params,
            } => {
                let subjects_t = left.select_n(
                    deck,
                    &[CardCond::EdgeOut(*pairing_id)],
                    params.max_true.into(),
                );
                if subjects_t.len() < params.min_true.into() {
                    return Err(ErrorKind::NotEnoughData(params.min_true).into());
                }
                let mut answers_t = vec![];
                for inst in subjects_t {
                    let inst2 = right
                        .select(deck, &[CardCond::Edge(inst.index, *pairing_id)])
                        .ok_or_else(|| ErrorKind::NotEnoughData(1))?;
                    answers_t.push((inst, inst2));
                }
                let lconds: Vec<_> = predicate
                    .iter()
                    .map(|e| CardCond::ExpressionOut(e.clone()))
                    .collect();
                let mut answers_f = vec![];
                for _ in 0..2 {
                    let subjects_f = left.select_n(deck, &lconds, params.max_false().into());
                    for inst in subjects_f {
                        let mut rconds = vec![CardCond::NoEdge(inst.index, *pairing_id)];
                        predicate.iter().for_each(|e| {
                            rconds.push(CardCond::Predicate(e.clone(), Some(inst.index)))
                        });
                        if let Some(inst2) = right.select(deck, &rconds) {
                            answers_f.push((inst, inst2));
                            if answers_f.len() >= params.max_false().into() {
                                break;
                            }
                        }
                    }
                    if answers_f.len() >= params.min_false().into() {
                        break;
                    }
                }
                if answers_f.len() < params.min_false().into() {
                    return Err(ErrorKind::NotEnoughData(params.min_false()).into());
                }
                let (answers, expectations) =
                    transform_multiple_choice(answers_t, answers_f, params, |id, (inst, inst2)| {
                        TriviaAnswer {
                            id,
                            answer: format!(
                                "{} {} {}",
                                deck.data.cards[inst.index].title,
                                separator,
                                deck.data.cards[inst2.index].title
                            ),
                            // TODO edge information
                            question_value: String::new().into(),
                        }
                    });
                let question = common.question_format.clone();
                let trivia = Trivia::new_selection(params, question, "string", answers);
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
    fn test_card_stat(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::CardStat {
            left: None,
            right: selectors::Stat {
                difficulty: -0.5,
                expression: expr("R\"Capital\"").unwrap(),
                return_type: ExprType::String,
            },
            params: MultipleChoiceCommon {
                min_true: 1,
                max_true: 1,
                total: 4,
                is_inverted: false,
            },
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

    #[rstest]
    fn test_card_tag(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::CardTag {
            left: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            right: selectors::Tag {
                difficulty: -0.5,
                which: decks[0]
                    .data
                    .tag_defs
                    .iter()
                    .enumerate()
                    .filter_map(|(i, td)| (td.label == "Director").then_some(i))
                    .next()
                    .unwrap(),
            },
            params: MultipleChoiceCommon {
                min_true: 1,
                max_true: 1,
                total: 4,
                is_inverted: false,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 0,
            question_format: "Who directed {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[0], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[0], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_tag_card(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::TagCard {
            left: selectors::Tag {
                difficulty: -0.5,
                which: decks[0]
                    .data
                    .tag_defs
                    .iter()
                    .enumerate()
                    .filter_map(|(i, td)| (td.label == "Director").then_some(i))
                    .next()
                    .unwrap(),
            },
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            params: MultipleChoiceCommon {
                min_true: 1,
                max_true: 1,
                total: 4,
                is_inverted: false,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 0,
            question_format: "Which movie was directed by {}?".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[0], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        for _ in 0..1000 {
            let _ = definition.get_trivia(&decks[0], &common)?;
        }
        Ok(())
    }

    #[rstest]
    fn test_pairing(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = MultipleChoiceDef::Pairing {
            left: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            separator: '+',
            pairing_id: 0,
            predicate: Some(
                expr(
                    "L\"Pronoun\" == R\"Partner pronoun\" and R\"Pronoun\" == L\"Partner pronoun\"",
                )
                .unwrap(),
            ),
            params: MultipleChoiceCommon {
                min_true: 3,
                max_true: 3,
                total: 4,
                is_inverted: true,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 3,
            question_format: "Pick the fake couple.".into(),
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
}
