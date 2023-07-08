use std::cmp::Ordering;

use crate::{
    tinylang::{self, OwnedExprValue},
    trivia::types::TriviaExp,
    types::NaiveDateTimeExt,
};

use super::{
    engine::{CardCond, Select, TriviaGen},
    types::{
        instances, selectors, ActiveDeck, GradeableTrivia, QValue, Trivia, TriviaAnswer,
        TriviaAnswerType, TriviaDefCommon,
    },
    Error, ErrorKind, Result,
};

pub struct RankingCommon {
    is_asc: bool,
    is_single: bool,
    total: u8,
}

impl RankingCommon {
    fn num_answers(&self) -> u8 {
        if self.is_single {
            1
        } else {
            self.total
        }
    }
}

pub enum RankingDef {
    Card {
        left: Option<selectors::Category>,
        right: selectors::Card,
        params: RankingCommon,
    },
    CardCard {
        left: selectors::Card,
        right: selectors::Card,
        stat: selectors::StatNested,
        separator: char,
        params: RankingCommon,
    },
}

impl<T> Trivia<T> {
    pub fn new_ranking(
        params: &RankingCommon,
        question: String,
        question_value_type: &str,
        options: Vec<TriviaAnswer<T>>,
    ) -> Self {
        let answer_type = match (params.is_asc, params.is_single) {
            (true, true) => TriviaAnswerType::StatMin,
            (true, false) => TriviaAnswerType::StatAsc,
            (false, true) => TriviaAnswerType::StatMax,
            (false, false) => TriviaAnswerType::StatDesc,
        };
        Self {
            question,
            answer_type,
            min_answers: params.num_answers(),
            max_answers: params.num_answers(),
            question_value_type: question_value_type.into(),
            options,
            prefilled_answers: vec![],
        }
    }
}

fn transform_ranking<E, F>(
    answers_in: Vec<E>,
    params: &RankingCommon,
    mut fun: F,
) -> (Vec<TriviaAnswer<QValue>>, Vec<TriviaExp>)
where
    F: FnMut(u8, E) -> (f64, TriviaAnswer<QValue>),
{
    let mut answers = vec![];
    let mut numeric = vec![];
    for (id, inst) in answers_in.into_iter().enumerate() {
        let (x, ans) = fun(id as u8, inst);
        answers.push(ans);
        numeric.push(x);
    }
    let mut order: Vec<_> = numeric.into_iter().enumerate().collect();
    order.sort_by(|(_, a), (_, b)| {
        let o = a.partial_cmp(b).unwrap_or(Ordering::Equal);
        if params.is_asc {
            o
        } else {
            o.reverse()
        }
    });
    let mut iter = order.iter().peekable();
    let mut acc: Vec<u8> = vec![];
    let mut groups: Vec<Vec<u8>> = vec![];
    while let Some(curr) = iter.next() {
        acc.push(curr.0 as u8);
        match iter.peek() {
            Some((_, x)) if x == &curr.1 => (),
            _ => {
                groups.push(acc.drain(..).collect());
            }
        }
    }
    let expectations = if params.is_single {
        let ids = groups.drain(..).next().unwrap();
        vec![TriviaExp::Any { ids }]
    } else {
        let mut exps = vec![];
        let mut min_pos = 0u8;
        for ids in groups {
            let l = ids.len() as u8;
            exps.push(TriviaExp::AllPos { ids, min_pos });
            min_pos += l;
        }
        exps
    };
    (answers, expectations)
}

impl TriviaGen for RankingDef {
    fn get_trivia(&self, deck: &ActiveDeck, common: &TriviaDefCommon) -> Result<GradeableTrivia> {
        match self {
            RankingDef::Card {
                left,
                right,
                params,
            } => {
                let stat_sel = match &right.stats[..] {
                    [sel] => sel,
                    _ => {
                        return Err(Error::from(ErrorKind::Msg(
                            "expected one StatNested".into(),
                        )))
                    }
                };
                let subj = match left {
                    Some(sel) => Some(
                        sel.select(deck, &[])
                            .ok_or_else(|| ErrorKind::NotEnoughData(1))?,
                    ),
                    None => None,
                };
                let conds: Vec<_> = subj
                    .iter()
                    .map(|inst| CardCond::Category(inst.clone()))
                    .collect();
                let answers = right.select_n(deck, &conds, params.total.into());
                if answers.len() < params.total.into() {
                    return Err(ErrorKind::NotEnoughData(params.total).into());
                }
                let (answers, expectations) = transform_ranking(answers, params, |id, mut inst| {
                    let stat = inst.stats.pop().unwrap();
                    let (num, question_value) = match stat.value {
                        OwnedExprValue::Number(v) => (v, v.into()),
                        OwnedExprValue::Date(v) => (
                            v.timestamp_millis() as f64,
                            v.format(NaiveDateTimeExt::strftime_format())
                                .to_string()
                                .into(),
                        ),
                        _ => panic!(
                            "RankingDef::Card: right.stats[0] must have return type Number or Date"
                        ),
                    };
                    let ans = TriviaAnswer {
                        id,
                        answer: deck.data.cards[inst.index].title.clone().into(),
                        question_value,
                    };
                    (num, ans)
                });
                let question = match subj {
                    Some(instances::Category(cat)) => {
                        common.question_format.as_str().replace("{}", &cat)
                    }
                    None => common.question_format.clone(),
                };
                let question_value_type = match stat_sel.return_type {
                    tinylang::ExprType::Number => "number",
                    tinylang::ExprType::Date => "string",
                    _ => panic!(
                        "RankingDef::Card: right.stats[0] must have return type Number or Date"
                    ),
                };
                let trivia = Trivia::new_ranking(params, question, question_value_type, answers);
                Ok((trivia, expectations))
            }
            RankingDef::CardCard {
                left,
                right,
                stat,
                separator,
                params,
            } => {
                let lconds = vec![CardCond::ExpressionOut(stat.expression.clone())];
                let rconds = vec![CardCond::ExpressionIn(stat.expression.clone())];
                let expr = stat.expression.optimize(&deck.data, &deck.data).unwrap();
                let mut answers = vec![];
                for _ in 0..2 {
                    let subjects = left.select_n(deck, &lconds, params.total.into());
                    for inst in subjects {
                        if let Some(inst2) = right.select(deck, &rconds) {
                            answers.push((inst, inst2));
                            if answers.len() >= params.total.into() {
                                break;
                            }
                        }
                    }
                    if answers.len() >= params.total.into() {
                        break;
                    }
                }
                if answers.len() < params.total.into() {
                    return Err(ErrorKind::NotEnoughData(params.total).into());
                }
                let (answers, expectations) = transform_ranking(
                    answers,
                    params,
                    |id, (inst, inst2)| {
                        let value = expr
                            .get_value(inst.index, inst2.index)
                            .unwrap()
                            .expect("null-checker lied");
                        let (num, question_value) = match value {
                            OwnedExprValue::Number(v) => (v, v.into()),
                            OwnedExprValue::Date(v) => (
                                v.timestamp_millis() as f64,
                                v.format(NaiveDateTimeExt::strftime_format()).to_string().into(),
                            ),
                            _ => panic!(
                                "RankingDef::Card: right.stats[0] must have return type Number or Date"
                            ),
                        };
                        let ans = TriviaAnswer {
                            id,
                            answer: format!(
                                "{} {} {}",
                                deck.data.cards[inst.index].title,
                                separator,
                                deck.data.cards[inst2.index].title
                            ),
                            question_value,
                        };
                        (num, ans)
                    },
                );
                let question = common.question_format.clone();
                let question_value_type = match stat.return_type {
                    tinylang::ExprType::Number => "number",
                    tinylang::ExprType::Date => "string",
                    _ => panic!(
                        "RankingDef::Card: right.stats[0] must have return type Number or Date"
                    ),
                };
                let trivia = Trivia::new_ranking(params, question, question_value_type, answers);
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
    fn test_card_number(
        decks: &Vec<Deck>,
        #[values(false, true)] is_asc: bool,
        #[values(false, true)] is_single: bool,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = RankingDef::Card {
            left: Some(selectors::Category { difficulty: 0.0 }),
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![selectors::StatNested {
                    expression: expr("R\"Spotify plays\"").unwrap(),
                    return_type: ExprType::Number,
                }],
            },
            params: RankingCommon {
                is_asc,
                is_single,
                total: 3,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 2,
            question_format: "Rank these songs from most to least Spotify plays".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[2], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        if !is_asc && !is_single {
            for _ in 0..1000 {
                let _ = definition.get_trivia(&decks[2], &common)?;
            }
        }
        Ok(())
    }

    #[rstest]
    fn test_card_date(
        decks: &Vec<Deck>,
        #[values(false, true)] is_asc: bool,
        #[values(false, true)] is_single: bool,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = RankingDef::Card {
            left: Some(selectors::Category { difficulty: 0.0 }),
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![selectors::StatNested {
                    expression: expr("R\"Birth date\"").unwrap(),
                    return_type: ExprType::Date,
                }],
            },
            params: RankingCommon {
                is_asc,
                is_single,
                total: 3,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 3,
            question_format: "Rank these people from earliest to latest birth dates".into(),
        };
        let (trivia, exps) = definition.get_trivia(&decks[3], &common)?;
        writeln!(
            std::io::stderr(),
            "trivia = {}\nexps = {:?}\n---\n",
            trivia,
            exps
        )?;
        if !is_asc && !is_single {
            for _ in 0..1000 {
                let _ = definition.get_trivia(&decks[3], &common)?;
            }
        }
        Ok(())
    }

    #[rstest]
    fn test_card_squared(
        decks: &Vec<Deck>,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks
            .iter()
            .cloned()
            .map(|d| ActiveDeck::new(d.data))
            .collect();
        let definition = RankingDef::CardCard {
            left: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            right: selectors::Card {
                difficulty: -0.5,
                stats: vec![],
            },
            stat: selectors::StatNested {
                expression: expr("L\"Coordinates\" <-> R\"Coordinates\"").unwrap(),
                return_type: ExprType::Number,
            },
            separator: '↔',
            params: RankingCommon {
                is_asc: true,
                is_single: true,
                total: 3,
            },
        };
        let common = TriviaDefCommon {
            deck_id: 4,
            question_format: "Pick the closest pair of cities geographically.".into(),
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