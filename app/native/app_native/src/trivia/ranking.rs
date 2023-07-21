use std::cmp::Ordering;

use crate::{
    tinylang::{self, OwnedExprValue},
    trivia::types::{StatAxisMod, TriviaExp},
    types::NaiveDateTimeExt,
};

use super::{
    engine::{CardCond, Select, TriviaGen},
    types::{
        instances, selectors, ActiveDeck, GradeableTrivia, RankingType, SanityCheck,
        StatAnnotation, Trivia, TriviaAnswer, TriviaAnswerType, TriviaDefCommon,
    },
    ErrorKind, Result,
};

pub struct RankingCommon {
    pub ranking_type: RankingType,
    pub total: u8,
    pub stat_annotation: Option<StatAnnotation>,
}

impl SanityCheck for RankingCommon {
    type Error = super::Error;

    fn sanity_check(&self) -> std::result::Result<(), Self::Error> {
        if self.total <= 1 {
            return Err(ErrorKind::Msg("total > 1".into()).into());
        }
        Ok(())
    }
}

impl RankingCommon {
    pub fn new(
        ranking_type: RankingType,
        total: u8,
        stat_annotation: Option<StatAnnotation>,
    ) -> Self {
        Self {
            ranking_type,
            total,
            stat_annotation,
        }
    }

    pub fn typical(ranking_type: RankingType, total: u8) -> Self {
        Self {
            ranking_type,
            total,
            stat_annotation: None,
        }
    }

    fn is_single(&self) -> bool {
        matches!(self.ranking_type, RankingType::Min | RankingType::Max)
    }

    fn is_asc(&self) -> bool {
        self.is_inverted() != matches!(self.ranking_type, RankingType::Min | RankingType::Asc)
    }

    fn is_inverted(&self) -> bool {
        matches!(
            self.stat_annotation.and_then(|x| x.axis_mod),
            Some(StatAxisMod::Age)
        )
    }

    fn num_answers(&self) -> u8 {
        if self.is_single() {
            1
        } else {
            self.total
        }
    }
}

pub enum RankingDef {
    Card {
        left: Option<selectors::Category>,
        right: selectors::Stat,
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

impl Trivia {
    pub fn new_ranking(
        params: &RankingCommon,
        question: String,
        question_value_type: tinylang::ExprType,
        options: Vec<TriviaAnswer>,
    ) -> Self {
        Self {
            question,
            answer_type: TriviaAnswerType::Ranking(params.ranking_type),
            min_answers: params.num_answers(),
            max_answers: params.num_answers(),
            question_value_type,
            stat_annotation: params.stat_annotation,
            options,
            prefilled_answers: vec![],
        }
    }
}

fn transform_ranking<E, F>(
    answers_in: Vec<E>,
    params: &RankingCommon,
    mut fun: F,
) -> (Vec<TriviaAnswer>, Vec<TriviaExp>)
where
    F: FnMut(u8, E) -> (f64, TriviaAnswer),
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
        if params.is_asc() {
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
    let expectations = if params.is_single() {
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
                let (answers, expectations) =
                    transform_ranking(answers, params, |id, (idx, stat)| {
                        let (num, question_value) = match stat.value {
                            OwnedExprValue::Number(v) => (v, v.into()),
                            OwnedExprValue::Date(v) => (v.timestamp_millis() as f64, v.into()),
                            _ => panic!(
                            "RankingDef::Card: right.stats[0] must have return type Number or Date"
                        ),
                        };
                        let ans = TriviaAnswer {
                            id,
                            answer: deck.data.cards[idx].title.clone(),
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
                let trivia = Trivia::new_ranking(params, question, right.return_type, answers);
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
                let trivia = Trivia::new_ranking(params, question, stat.return_type, answers);
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
        decks: &[Deck],
        #[values(
            RankingType::Min,
            RankingType::Asc,
            RankingType::Max,
            RankingType::Desc
        )]
        typ: RankingType,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks.iter().cloned().map(ActiveDeck::new).collect();
        let definition = RankingDef::Card {
            left: Some(selectors::Category { difficulty: 0.0 }),
            right: selectors::Stat {
                difficulty: -0.5,
                expression: expr("R\"Spotify plays\"").unwrap(),
                return_type: ExprType::Number,
            },
            params: RankingCommon::typical(typ, 3),
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
        if matches!(typ, RankingType::Min) {
            for _ in 0..1000 {
                let _ = definition.get_trivia(&decks[2], &common)?;
            }
        }
        Ok(())
    }

    #[rstest]
    fn test_card_date(
        decks: &[Deck],
        #[values(
            RankingType::Min,
            RankingType::Asc,
            RankingType::Max,
            RankingType::Desc
        )]
        typ: RankingType,
    ) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks.iter().cloned().map(ActiveDeck::new).collect();
        let definition = RankingDef::Card {
            left: Some(selectors::Category { difficulty: 0.0 }),
            right: selectors::Stat {
                difficulty: -0.5,
                expression: expr("R\"Birth date\"").unwrap(),
                return_type: ExprType::Date,
            },
            params: RankingCommon::typical(typ, 3),
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
        if matches!(typ, RankingType::Min) {
            for _ in 0..1000 {
                let _ = definition.get_trivia(&decks[3], &common)?;
            }
        }
        Ok(())
    }

    #[rstest]
    fn test_card_squared(decks: &[Deck]) -> std::result::Result<(), Box<dyn std::error::Error>> {
        let decks: Vec<_> = decks.iter().cloned().map(ActiveDeck::new).collect();
        let definition = RankingDef::CardCard {
            left: selectors::Card::new(-0.5),
            right: selectors::Card::new(-0.5),
            stat: selectors::StatNested {
                expression: expr("L\"Coordinates\" <-> R\"Coordinates\"").unwrap(),
                return_type: ExprType::Number,
            },
            separator: '↔',
            params: RankingCommon::typical(RankingType::Min, 3),
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
