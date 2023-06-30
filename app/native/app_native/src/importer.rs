use std::{
    cmp::Ordering,
    collections::{HashMap, HashSet},
};

use chrono::{NaiveDate, NaiveTime};
use error_chain::error_chain;
use lazy_static::lazy_static;
use regex::Regex;
use serde::Deserialize;

use crate::{
    tinylang::{expr, ExprType, Expression},
    types::{
        AnnotatedDeck, Callout, Card, CardTable, Deck, Edge, NaiveDateTimeExt, Pairing, StatArray,
        StatDef, StatUnit, TagDef,
    },
};

fn sheet_column_name(index: usize) -> String {
    let chars: Vec<_> = std::iter::successors(Some(index), |x| Some(x / 26).filter(|xn| *xn > 0))
        .map(|x| char::from_u32(('A' as u32) + (x % 26) as u32).unwrap())
        .collect();
    chars.into_iter().rev().collect()
}

#[derive(Clone, Copy)]
struct Column<'a> {
    index: usize,
    header: &'a str,
    body: &'a [String],
}

impl<'a> Column<'a> {
    fn new(index: usize, header: &'a str, body: &'a [String]) -> Self {
        Self {
            index,
            header,
            body,
        }
    }
}

struct PairingReferenceColumns<'a> {
    left: Column<'a>,
    right: Column<'a>,
    is_symmetric: bool,
    info: Option<Column<'a>>,
}

impl PairingReferenceColumns<'_> {
    fn end_index(&self) -> usize {
        match self.info {
            None => self.right.index,
            Some(col) => col.index,
        }
    }
}

struct PairingColumns<'a> {
    label: String,
    reference_columns: Option<PairingReferenceColumns<'a>>,
    criteria_for_all: Column<'a>,
    criteria_common: Option<Column<'a>>,
}

impl PairingColumns<'_> {
    fn start_index(&self) -> usize {
        match &self.reference_columns {
            None => self.criteria_for_all.index,
            Some(rc) => rc.left.index,
        }
    }
    
    fn end_index(&self) -> usize {
        match &self.criteria_common {
            None => self.criteria_for_all.index,
            Some(col) => col.index,
        }
    }
}

#[derive(Default)]
struct CardColumns<'a> {
    title: Option<Column<'a>>,
    unique_id: Option<Column<'a>>,
    is_disabled: Option<Column<'a>>,
    notes: Option<Column<'a>>,
    popularity: Option<Column<'a>>,
    category: Option<Column<'a>>,
}

#[derive(Default)]
struct StructuredColumns<'a> {
    card_columns: CardColumns<'a>,
    stat_columns: Vec<Column<'a>>,
    tag_columns: Vec<Column<'a>>,
    pairings: Vec<PairingColumns<'a>>,
}

enum IError<I> {
    Cont(I),
    Halt((I, Callout)),
}

type IResult<I> = std::result::Result<I, IError<I>>;
type IResult2<I, O> = std::result::Result<(I, O), IError<I>>;

trait InsertNew<T> {
    fn insert_new<F>(&mut self, f: F) -> bool
    where
        F: FnOnce() -> T;
}

impl<T> InsertNew<T> for Option<T> {
    fn insert_new<F>(&mut self, f: F) -> bool
    where
        F: FnOnce() -> T,
    {
        match self {
            Some(_) => false,
            None => {
                let _ = self.insert(f());
                true
            }
        }
    }
}

fn parse_empty_column<'a>(
    _out: &mut StructuredColumns<'a>,
    input: &'a [Option<Column<'a>>],
) -> IResult<&'a [Option<Column<'a>>]> {
    if let Some((None, rest)) = input.split_first() {
        Ok(rest)
    } else {
        Err(IError::Cont(input))
    }
}

fn parse_card_column<'a>(
    out: &mut StructuredColumns<'a>,
    input: &'a [Option<Column<'a>>],
) -> IResult<&'a [Option<Column<'a>>]> {
    let Some((Some(col), rest)) = input.split_first() else {
        return Err(IError::Cont(input))
    };
    let receiver = match col.header {
        "Card" => &mut out.card_columns.title,
        "ID" => &mut out.card_columns.unique_id,
        "Disable?" => &mut out.card_columns.is_disabled,
        "Notes" => &mut out.card_columns.notes,
        "Popularity" => &mut out.card_columns.popularity,
        "Category" => &mut out.card_columns.category,
        _ => return Err(IError::Cont(input)),
    };
    if receiver.insert_new(|| *col) {
        Ok(rest)
    } else {
        let callout = Callout::Warning(format!(
            "Duplicate column: {} ({})",
            col.header,
            sheet_column_name(col.index)
        ));
        Err(IError::Halt((rest, callout)))
    }
}

fn parse_tag_column<'a>(
    out: &mut StructuredColumns<'a>,
    input: &'a [Option<Column<'a>>],
) -> IResult<&'a [Option<Column<'a>>]> {
    let Some((Some(col), rest)) = input.split_first() else {
        return Err(IError::Cont(input))
    };
    if let Some(label) = col.header.strip_suffix("[]") {
        if label.is_empty() {
            let callout = Callout::Warning(format!(
                "Invalid column name '[]' ({})",
                sheet_column_name(col.index)
            ));
            return Err(IError::Halt((rest, callout)));
        }
        out.tag_columns
            .push(Column::new(col.index, label, col.body));
        Ok(rest)
    } else {
        Err(IError::Cont(input))
    }
}

fn parse_pairing_colgroup_refs<'a>(
    input: &'a [Option<Column<'a>>],
) -> IResult2<&'a [Option<Column<'a>>], PairingReferenceColumns> {
    let Some((Some(lcol), rest1)) = input.split_first() else {
        return Err(IError::Cont(input))
    };
    let Some(label) = lcol.header.strip_suffix("->") else {
        return Err(IError::Cont(input))
    };
    if label.is_empty() {
        let callout = Callout::Error(format!(
            "Pairing name is required ({})",
            sheet_column_name(lcol.index)
        ));
        return Err(IError::Halt((rest1, callout)));
    }
    let Some((Some(rcol), rest2)) = rest1.split_first() else {
        let callout = Callout::Error(format!("Incomplete pairing {} ({1}-{1})",
            label, sheet_column_name(lcol.index)
        ));
        return Err(IError::Halt((rest1, callout)))
    };
    let is_symmetric = match rcol.header.strip_prefix("->") {
        Some(s) if s == label => false,
        Some(_) => {
            let callout = Callout::Error(format!(
                "Right side of pairing must match name of left ({}, {})",
                label,
                sheet_column_name(rcol.index)
            ));
            return Err(IError::Halt((rest2, callout)));
        }
        None => match rcol.header.strip_prefix("<-") {
            Some(s) if s == label => false,
            Some(_) => {
                let callout = Callout::Error(format!(
                    "Right side of pairing must match name of left ({}, {})",
                    label,
                    sheet_column_name(rcol.index)
                ));
                return Err(IError::Halt((rest2, callout)));
            }
            None => {
                let callout = Callout::Error(format!(
                    "Incomplete pairing {} ({1}-{1})",
                    label,
                    sheet_column_name(lcol.index)
                ));
                return Err(IError::Halt((rest2, callout)));
            }
        },
    };
    let (icol, rest3) = match rest2.split_first() {
        Some((Some(c), r)) if c.header == "Info" => (Some(c), r),
        _ => (None, rest2),
    };
    let refs = PairingReferenceColumns {
        left: Column::new(lcol.index, label, lcol.body),
        right: Column::new(rcol.index, label, rcol.body),
        is_symmetric,
        info: icol.cloned(),
    };
    Ok((rest3, refs))
}

type PairingCriteriaColumns<'a> = (&'a str, &'a Column<'a>, Option<&'a Column<'a>>);

fn parse_pairing_criteria_cols<'a>(
    input: &'a [Option<Column<'a>>],
) -> IResult2<&'a [Option<Column<'a>>], PairingCriteriaColumns<'a>> {
    let Some((Some(acol), rest1)) = input.split_first() else {
        return Err(IError::Cont(input))
    };
    let Some(label) = acol.header.strip_prefix('∀') else {
        return Err(IError::Cont(input))
    };
    let (ccol, rest2) = match rest1.split_first() {
        Some((Some(c), r)) if c.header == "🚀" => (Some(c), r),
        _ => (None, rest1),
    };
    Ok((rest2, (label, acol, ccol)))
}

fn parse_pairing_colgroup<'a>(
    out: &mut StructuredColumns<'a>,
    input: &'a [Option<Column<'a>>],
) -> IResult<&'a [Option<Column<'a>>]> {
    let (rest1, reference_columns): (&[Option<Column<'_>>], Option<PairingReferenceColumns<'_>>) =
        parse_pairing_colgroup_refs(input)
            .map(|(in2, rc)| (in2, Some(rc)))
            .or_else(|e| match e {
                IError::Cont(in2) => Ok((in2, None)),
                e_halt => Err(e_halt),
            })?;
    let (rest2, criteria_columns) =
        parse_pairing_criteria_cols(rest1).map_err(|e| match (e, &reference_columns) {
            (IError::Cont(nxt), None) => IError::Cont(nxt),
            (IError::Cont(nxt), Some(rc)) => {
                let callout = Callout::Error(format!(
                    "Incomplete pairing {} ({}-{})",
                    rc.left.header,
                    sheet_column_name(rc.left.index),
                    sheet_column_name(rc.end_index())
                ));
                IError::Halt((nxt, callout))
            }
            (e_halt, _) => e_halt,
        })?;

    let (alabel, acol, ccol) = criteria_columns;
    let label = match &reference_columns {
        None => {
            if alabel.is_empty() {
                let callout = Callout::Error(format!(
                    "Pairing name is required ({})",
                    sheet_column_name(acol.index)
                ));
                return Err(IError::Halt((rest2, callout)));
            } else {
                alabel
            }
        }
        Some(rc) => {
            if !alabel.is_empty() && alabel != rc.left.header {
                let callout = Callout::Error(format!(
                    "Pairing name mismatch ({}-{})",
                    sheet_column_name(rc.left.index),
                    sheet_column_name(acol.index)
                ));
                return Err(IError::Halt((rest2, callout)));
            }
            rc.left.header
        }
    };
    out.pairings.push(PairingColumns {
        label: label.to_owned(),
        reference_columns,
        criteria_for_all: *acol,
        criteria_common: ccol.copied(),
    });
    Ok(rest2)
}

fn parse_stat_column<'a>(
    out: &mut StructuredColumns<'a>,
    input: &'a [Option<Column<'a>>],
) -> IResult<&'a [Option<Column<'a>>]> {
    let Some((Some(col), rest)) = input.split_first() else {
        return Err(IError::Cont(input))
    };
    out.stat_columns.push(*col);
    Ok(rest)
}

fn parse_anything<'a>(
    out: &mut StructuredColumns<'a>,
    input: &'a [Option<Column<'a>>],
) -> (&'a [Option<Column<'a>>], Option<Callout>) {
    let input = match parse_empty_column(out, input) {
        Ok(nxt) => return (nxt, None),
        Err(IError::Cont(in2)) => in2,
        Err(IError::Halt((nxt, callout))) => return (nxt, Some(callout)),
    };
    let input = match parse_card_column(out, input) {
        Ok(nxt) => return (nxt, None),
        Err(IError::Cont(in2)) => in2,
        Err(IError::Halt((nxt, callout))) => return (nxt, Some(callout)),
    };
    let input = match parse_tag_column(out, input) {
        Ok(nxt) => return (nxt, None),
        Err(IError::Cont(in2)) => in2,
        Err(IError::Halt((nxt, callout))) => return (nxt, Some(callout)),
    };
    let input = match parse_pairing_colgroup(out, input) {
        Ok(nxt) => return (nxt, None),
        Err(IError::Cont(in2)) => in2,
        Err(IError::Halt((nxt, callout))) => return (nxt, Some(callout)),
    };
    let input = match parse_stat_column(out, input) {
        Ok(nxt) => return (nxt, None),
        Err(IError::Cont(in2)) => in2,
        Err(IError::Halt((nxt, callout))) => return (nxt, Some(callout)),
    };
    let (first, rest) = input.split_first().unwrap();
    (
        rest,
        Some(Callout::Warning(format!(
            "Skipped column {}",
            first
                .map(|c| sheet_column_name(c.index))
                .unwrap_or("?".to_owned())
        ))),
    )
}

fn group_columns<'a>(
    columns: &'a [Option<Column<'a>>],
    callouts: &mut Vec<Callout>,
) -> StructuredColumns<'a> {
    let mut result = StructuredColumns::default();
    let mut remaining = columns;
    while !remaining.is_empty() {
        let (next, maybe_callout) = parse_anything(&mut result, remaining);
        if let Some(callout) = maybe_callout {
            callouts.push(callout);
        }
        remaining = next;
    }
    result
}

fn convert_cards(card_columns: CardColumns<'_>, callouts: &mut Vec<Callout>) -> Vec<Card> {
    let mut cards = vec![];
    let Some(title_column) = card_columns.title else {
        callouts.push(Callout::Error("Title column is required".into()));
        return cards
    };
    let mut id_set = HashSet::new();

    for (row_index, cell) in title_column.body.iter().enumerate() {
        if cell.is_empty() {
            // TODO stop after 10 errors of same type
            callouts.push(Callout::Error(format!(
                "Title can not be empty ({}{})",
                sheet_column_name(title_column.index),
                row_index + 2
            )))
        }

        let unique_id = card_columns
            .unique_id
            .and_then(|col| col.body.get(row_index))
            .filter(|s| !s.is_empty())
            .cloned();
        let is_disabled = card_columns
            .is_disabled
            .and_then(|col| col.body.get(row_index))
            .map(|s| {
                !matches!(
                    s.as_str(),
                    "" | "0" | "n" | "N" | "no" | "No" | "NO" | "false" | "False" | "FALSE"
                )
            })
            .unwrap_or(false);
        let notes = card_columns
            .notes
            .and_then(|col| col.body.get(row_index))
            .filter(|s| !s.is_empty())
            .cloned();
        let popularity = match card_columns.popularity {
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
                            row_index + 2
                        )));
                        0.0
                    }
                    None => 0.0,
                }
            }
            None => 0.0,
        };
        let category = card_columns
            .category
            .and_then(|col| col.body.get(row_index))
            .filter(|s| !s.is_empty())
            .cloned();

        if let Some(id) = unique_id.clone() {
            if !id_set.insert(id) {
                callouts.push(Callout::Error(format!(
                    "Duplicate ID ({}{})",
                    sheet_column_name(card_columns.unique_id.unwrap().index),
                    row_index + 2
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

fn convert_tag_defs(
    tag_columns: Vec<Column<'_>>,
    len: usize,
    callouts: &mut Vec<Callout>,
) -> Vec<TagDef> {
    let mut tag_defs = vec![];
    let mut labels = HashSet::new();
    for col in tag_columns {
        if len > 0 && col.body.len() > len {
            callouts.push(Callout::Warning(format!(
                "Skipping data below row {} in column {}",
                len + 1,
                sheet_column_name(col.index)
            )));
        }
        if col.body.iter().take(len).all(|s| s.is_empty()) {
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
        labels.insert(col.header);
        let label = col.header.to_owned();

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

trait StatArrayConverter {
    type Item;
    fn convert_one(&self, src: &str) -> Option<Self::Item>;
    fn finalize(&self, values: Vec<Option<Self::Item>>) -> StatArray;
}

trait StatArrayConvert {
    fn convert(&self, src: &[String]) -> Option<StatArray>;
}

impl<A> StatArrayConvert for A
where
    A: StatArrayConverter,
{
    fn convert(&self, src: &[String]) -> Option<StatArray> {
        let mut values = vec![];
        for cell in src {
            if cell.is_empty() {
                values.push(None)
            } else {
                let val = self.convert_one(cell)?;
                values.push(Some(val))
            }
        }
        Some(self.finalize(values))
    }
}

mod formats {
    pub struct Numeric {}
    pub struct Iso8601 {}
    pub struct DollarAmount {}
    pub struct Coordinates {}
}

impl StatArrayConverter for formats::Numeric {
    type Item = f64;

    fn convert_one(&self, src: &str) -> Option<f64> {
        src.parse().ok()
    }

    fn finalize(&self, values: Vec<Option<f64>>) -> StatArray {
        StatArray::Number { unit: None, values }
    }
}

impl StatArrayConverter for formats::DollarAmount {
    type Item = f64;

    fn convert_one(&self, src: &str) -> Option<f64> {
        lazy_static! {
            static ref RE: Regex = Regex::new(r",([0-9]{3})").unwrap();
        }
        let (minus, cell2) = src.strip_prefix('-').map_or((false, src), |s| (true, s));
        cell2
            .strip_prefix('$')
            .map(|s| RE.replace_all(s, "$1"))
            .and_then(|s| s.parse().ok())
            .map(|x: f64| if minus { -x } else { x })
    }

    fn finalize(&self, values: Vec<Option<f64>>) -> StatArray {
        StatArray::Number {
            unit: Some(StatUnit::Dollar),
            values,
        }
    }
}

impl StatArrayConverter for formats::Iso8601 {
    type Item = NaiveDateTimeExt;

    fn convert_one(&self, src: &str) -> Option<NaiveDateTimeExt> {
        let date = NaiveDate::parse_from_str(src, "%Y-%m-%d").ok()?;
        Some(date.and_time(NaiveTime::MIN).into())
    }

    fn finalize(&self, values: Vec<Option<NaiveDateTimeExt>>) -> StatArray {
        StatArray::Date { values }
    }
}

impl StatArrayConverter for formats::Coordinates {
    type Item = (f64, f64);

    fn convert_one(&self, src: &str) -> Option<(f64, f64)> {
        let parts: Vec<_> = src.split(',').collect();
        match parts[..] {
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
        }
    }

    fn finalize(&self, values: Vec<Option<(f64, f64)>>) -> StatArray {
        StatArray::LatLng { values }
    }
}

fn convert_stat_defs(
    stat_columns: Vec<Column<'_>>,
    len: usize,
    callouts: &mut Vec<Callout>,
) -> Vec<StatDef> {
    let mut stat_defs = vec![];
    let mut labels = HashSet::new();
    let value_parsers: [Box<dyn StatArrayConvert>; 4] = [
        Box::new(formats::Numeric {}),
        Box::new(formats::DollarAmount {}),
        Box::new(formats::Iso8601 {}),
        Box::new(formats::Coordinates {}),
    ];
    for col in stat_columns {
        if len > 0 && col.body.len() > len {
            callouts.push(Callout::Warning(format!(
                "Skipping data below row {} in column {}",
                len + 1,
                sheet_column_name(col.index)
            )))
        }
        if col.body.iter().take(len).all(|s| s.is_empty()) {
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
        labels.insert(col.header);
        let label = col.header.to_owned();

        let stat_array = value_parsers
            .iter()
            .filter_map(|p| p.convert(col.body))
            .next()
            .unwrap_or_else(|| StatArray::String {
                values: col
                    .body
                    .iter()
                    .take(len)
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

fn check_expression(
    input: &str,
    card_table: &CardTable,
    return_type: ExprType,
    location: String,
    callouts: &mut Vec<Callout>,
) -> Option<Expression> {
    let expr = match expr(input) {
        Ok(e) => e,
        Err(msg) => {
            callouts.push(Callout::Error(format!(
                "Syntax error: {} ({})",
                msg, location
            )));
            return None;
        }
    };
    let expr2 = match expr.optimize(card_table, card_table) {
        Ok(e) => e,
        Err(msg) => {
            callouts.push(Callout::Error(format!(
                "Name error: {} ({})",
                msg, location
            )));
            return None;
        }
    };
    match expr2.get_type() {
        Ok(typ) => {
            if typ == return_type {
                Some(expr)
            } else {
                callouts.push(Callout::Error(format!(
                    "Type error: outer expression must be {:?}, not {:?} ({})",
                    return_type, typ, location
                )));
                None
            }
        }
        Err(msg) => {
            callouts.push(Callout::Error(format!(
                "Type error: {} ({})",
                msg, location
            )));
            None
        }
    }
}

fn convert_pairing(
    pairing_columns: PairingColumns<'_>,
    card_table: &CardTable,
    index_map: &HashMap<String, u64>,
    pairing_name_set: &HashSet<String>,
    callouts: &mut Vec<Callout>,
) -> Option<Pairing> {
    if pairing_name_set.contains(pairing_columns.label.as_str()) {
        let callout = Callout::Warning(format!(
            "Duplicate pairing: {} ({}-{})",
            pairing_columns.label,
            sheet_column_name(pairing_columns.start_index()),
            sheet_column_name(pairing_columns.end_index()),
        ));
        callouts.push(callout);
        return None
    }

    let mut requirements_text = &mut String::new();
    requirements_text =
        pairing_columns
            .criteria_for_all
            .body
            .iter()
            .fold(requirements_text, |acc, cell| {
                if !cell.is_empty() {
                    if acc.is_empty() {
                        acc.push_str(format!("({})", cell).as_str())
                    } else {
                        acc.push_str(format!(" and ({})", cell).as_str())
                    }
                }
                acc
            });
    let requirements = if requirements_text.is_empty() {
        None
    } else {
        check_expression(
            requirements_text,
            card_table,
            ExprType::Bool,
            sheet_column_name(pairing_columns.criteria_for_all.index),
            callouts,
        )
    };
    let mut boosts = vec![];
    if let Some(col) = pairing_columns.criteria_common {
        for (row_index, boost_text) in col.body.iter().enumerate() {
            if boost_text.is_empty() {
                continue;
            }
            let maybe_boost_expr = check_expression(
                boost_text,
                card_table,
                ExprType::Number,
                format!("{}{}", sheet_column_name(col.index), row_index + 2),
                callouts,
            );
            if let Some(boost_expr) = maybe_boost_expr {
                boosts.push(boost_expr);
            }
        }
    }
    let mut edges = vec![];
    let mut is_symmetric = None;
    if let Some(refs) = pairing_columns.reference_columns {
        is_symmetric = Some(refs.is_symmetric);
        match refs.left.body.len().cmp(&refs.right.body.len()) {
            Ordering::Equal => (),
            Ordering::Greater => {
                callouts.push(Callout::Warning(format!(
                    "Skipping data below row {} in column {}",
                    refs.right.body.len() + 1,
                    sheet_column_name(refs.left.index)
                )));
            }
            Ordering::Less => {
                callouts.push(Callout::Warning(format!(
                    "Skipping data below row {} in column {}",
                    refs.left.body.len() + 1,
                    sheet_column_name(refs.right.index)
                )));
            }
        }
        let mut info_iter = refs.info.map(|c| c.body.iter()).unwrap_or([].iter());
        for (row_index, (id1, id2)) in refs.left.body.iter().zip(refs.right.body).enumerate() {
            let info = info_iter.next().filter(|s| !s.is_empty());
            if id1.is_empty() || id2.is_empty() {
                callouts.push(Callout::Warning(format!(
                    "Skipping row {} in pairing {} because of blank",
                    row_index + 2,
                    refs.left.header
                )));
                continue;
            }
            let Some(index1) = index_map.get(id1) else {
                callouts.push(Callout::Error(format!(
                    "Invalid ID in pairing {} ({}{})",
                    refs.left.header,
                    sheet_column_name(refs.left.index),
                    row_index + 2,
                )));
                continue
            };
            let Some(index2) = index_map.get(id2) else {
                callouts.push(Callout::Error(format!(
                    "Invalid ID in pairing {} ({}{})",
                    refs.left.header,
                    sheet_column_name(refs.right.index),
                    row_index + 2,
                )));
                continue
            };
            edges.push(Edge::new(*index1, *index2, info.cloned()));
        }
    }
    Some(Pairing {
        label: pairing_columns.criteria_for_all.header.to_owned(),
        is_symmetric: is_symmetric.unwrap_or(false),
        requirements,
        boosts,
        data: edges,
    })
}

fn convert_pairings(
    pairing_columns_list: Vec<PairingColumns<'_>>,
    card_table: &CardTable,
    callouts: &mut Vec<Callout>,
) -> Vec<Pairing> {
    let mut result = vec![];
    let mut index_map = HashMap::new();
    let mut pairing_name_set = HashSet::new();
    if card_table.cards.iter().all(|c| c.unique_id.is_some()) {
        for (idx, c) in card_table.cards.iter().enumerate() {
            let _ = index_map.insert(c.unique_id.as_ref().cloned().unwrap(), idx as u64);
        }
    } else {
        callouts.push(Callout::Error("Pairings require a full ID column".into()));
        return result;
    }
    for pairing_columns in pairing_columns_list {
        if let Some(pairing) = convert_pairing(pairing_columns, card_table, &index_map, &pairing_name_set, callouts) {
            pairing_name_set.insert(pairing.label.clone());
            result.push(pairing);
        }
    }
    result
}

fn parse_value_range(values: Vec<Vec<String>>) -> (CardTable, Vec<Callout>) {
    let mut callouts = vec![];
    let columns: Vec<_> = values
        .iter()
        .enumerate()
        .map(|(index, col)| {
            col.split_first()
                .map(|(header, body)| Column::new(index, header, body))
        })
        .collect();
    let structured_columns = group_columns(&columns, &mut callouts);
    let cards = convert_cards(structured_columns.card_columns, &mut callouts);
    let tag_defs = convert_tag_defs(structured_columns.tag_columns, cards.len(), &mut callouts);
    let stat_defs = convert_stat_defs(structured_columns.stat_columns, cards.len(), &mut callouts);
    let mut card_table = CardTable {
        cards,
        tag_defs,
        stat_defs,
        pairings: vec![],
    };
    let pairings = convert_pairings(structured_columns.pairings, &card_table, &mut callouts);
    card_table.pairings = pairings;
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
            image_url: None,
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
        tinylang::{expr, ExprType},
        types::{Callout, Card, CardTable, StatArray, StatUnit},
    };

    fn movies_row_major() -> Vec<Vec<String>> {
        let sheet = r#"[
        [ "Card",                   "ID",                   "Disable?", "Notes", "Popularity", "Category", "Actors[]",                                                                                   "Characters[]",                                                                        "Num Theaters", "Box Office", "Release Date", "Setting",     "Tagline" ],
        [ "The Matrix",             "TheMatrix",            "",         "",      "99",         "Action",   "Keanu Reeves, Carrie-Anne Moss, Laurence Fishburne, Hugo Weaving, Emil Eifrem",              "Neo, Trinity, Morpheus, Agent Smith, Emil",                                           "3084",         "$1,602,000", "1999-06-23",   "",            "Welcome to the Real World" ],
        [ "The Matrix Reloaded",    "TheMatrixReloaded",    "",         "",      "73",         "Action",   "Keanu Reeves, Carrie-Anne Moss, Laurence Fishburne, Hugo Weaving",                           "Neo, Trinity, Morpheus, Agent Smith",                                                 "2794",         "$1,138,000", "2003-01-26",   "",            "Free your mind" ],
        [ "The Matrix Revolutions", "TheMatrixRevolutions", "y",        "setoN", "62",         "Action",   "Keanu Reeves, Carrie-Anne Moss, Laurence Fishburne, Hugo Weaving",                           "Neo, Trinity, Morpheus, Agent Smith",                                                 "3144",         "$1,282,000", "2003-06-01",   "",            "Everything that has a beginning has an end" ],
        [ "The Devil's Advocate",   "TheDevilsAdvocate",    "",         "",      "16",         "Drama",    "Keanu Reeves, Charlize Theron, Al Pacino",                                                   "Kevin Lomax, Mary Ann Lomax, John Milton",                                            "2905",         "$1,088,000", "1997-09-21",   "",            "Evil has its winning ways" ],
        [ "A Few Good Men",         "AFewGoodMen",          "",         "",      "43",         "Drama",    "Tom Cruise, Jack Nicholson, Demi Moore, Kevin Bacon, Kiefer Sutherland, Noah Wyle",          "Lt. Daniel Kaffee, Col. Nathan R. Jessup, Lt. Cdr. JoAnne Galloway, Capt. Jack Ross", "3123",         "$6,617,000", "1992-06-26",   "",            "In the heart of the nation's capital, in a courthouse of the U.S. government, one man will stop at nothing to keep his honor, and one will stop at nothing to find the truth." ],
        [ "Top Gun",                "TopGun",               "",         "",      "65",         "Action",   "Tom Cruise, Kelly McGillis, Val Kilmer, Anthony Edwards, Tom Skerritt, Meg Ryan",            "Maverick, Charlie, Iceman, Goose, Viper, Carole",                                     "3060",         "$3,677,000", "1986-07-05",   "",            "I feel the need, the need for speed." ],
        [ "Jerry Maguire",          "JerryMaguire",         "",         "",      "38",         "Drama",    "Tom Cruise, Cuba Gooding Jr., Renee Zellweger, Kelly Preston, Jerry O'Connell, Jay Mohr",    "Jerry Maguire, Rod Tidwell, Dorothy Boyd, Avery Bishop, Frank Cushman, Bob Sugar",    "3187",         "$1,696,000", "2000-06-23",   "",            "The rest of his life begins now." ],
        [ "Stand By Me",            "StandByMe",            "",         "",      "88",         "Action",   "Wil Wheaton, River Phoenix, Jerry O'Connell, Corey Feldman, John Cusack, Kiefer Sutherland", "Gordie Lachance, Chris Chambers, Vern Tessio, Teddy Duchamp, Denny Lachance",         "2989",         "$5,691,000", "1986-12-22",   "",            "For some, it's the last real taste of innocence, and the first real taste of life. But for everyone, it's the time that memories are made of." ],
        [ "As Good as It Gets",     "AsGoodAsItGets",       "",         "",      "57",         "Drama",    "Jack Nicholson, Helen Hunt, Greg Kinnear, Cuba Gooding Jr.",                                 "Melvin Udall, Carol Connelly, Simon Bishop, Frank Sachs",                             "2936",         "$2,005,000", "1997-01-10",   "",            "A comedy from the heart that goes for the throat." ],
        [ "What Dreams May Come",   "WhatDreamsMayCome",    "",         "",      "44",         "Action",   "Robin Williams, Cuba Gooding Jr., Annabella Sciorra, Max von Sydow, Werner Herzog",          "Chris Nielsen, Albert Lewis, Annie Collins-Nielsen, The Tracker, The Face",           "2731",         "$7,036,000", "1998-06-08",   "",            "After life there is more. The end is just the beginning." ],
        [ "You've Got Mail",        "YouveGotMail",         "",         "",      "34",         "Drama",    "Tom Hanks, Meg Ryan, Greg Kinnear, Parker Posey, Dave Chappelle, Steve Zahn",                "Joe Fox, Kathleen Kelly, Frank Navasky, Patricia Eden, Kevin Jackson, George Pappas", "3026",         "$1,796,000", "1998-08-24",   "",            "At odds in life... in love on-line." ],
        [ "Joe Versus the Volcano", "JoeVersustheVolcano",  "",         "",      "44",         "Comedy",   "Tom Hanks, Meg Ryan, Nathan Lane",                                                           "Joe Banks, DeDe, Angelica Graynamore, Patricia Graynamore, Baw",                      "2789",         "$1,597,000", "1990-05-15",   "",            "A story of love, lava and burning desire." ],
        [ "When Harry Met Sally",   "WhenHarryMetSally",    "",         "",      "56",         "Action",   "Billy Crystal, Meg Ryan, Carrie Fisher, Bruno Kirby",                                        "Harry Burns, Sally Albright, Marie, Jess",                                            "2919",         "$5,532,000", "1998-10-15",   "",            "" ],
        [ "Sleepless in Seattle",   "SleeplessInSeattle",   "",         "",      "41",         "Action",   "Tom Hanks, Meg Ryan, Rita Wilson, Bill Pullman, Victor Garber, Rosie O'Donnell",             "Sam Baldwin, Annie Reed, Suzy, Walter, Greg, Becky",                                  "2716",         "$9,419,000", "1993-04-14",   "47.6,-122.3", "What if someone you never met, someone you never saw, someone you never knew was the only someone for you?" ],
        [ "Snow Falling on Cedars", "SnowFallingonCedars",  "n",        "",      "82",         "",         "",                                                                                           "",                                                                                    "",             "",           "",             "",            "" ]
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
        let (card_table, callouts) = parse_value_range(vec![]);
        assert_eq!(card_table, CardTable::default());
        assert!(matches!(callouts.first(), Some(Callout::Error(_))));
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
        assert_eq!(card_table.tag_defs[0].label, "Actors");
        assert_eq!(card_table.tag_defs[1].label, "Characters");
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

        assert_eq!(card_table.stat_defs.len(), 5);
        assert_eq!(card_table.stat_defs[0].label, "Num Theaters");
        match &card_table.stat_defs[0].data {
            StatArray::Number { unit: None, values } => {
                assert_eq!(values[0], Some(3084.0));
                assert_eq!(values[14], None);
            }
            other => panic!("unexpected stat type: {:?}", other),
        };
        assert_eq!(card_table.stat_defs[1].label, "Box Office");
        match &card_table.stat_defs[1].data {
            StatArray::Number {
                unit: Some(StatUnit::Dollar),
                values,
            } => {
                assert_eq!(values[0], Some(1_602_000.0));
                assert_eq!(values[14], None);
            }
            other => panic!("unexpected stat type: {:?}", other),
        };
        assert_eq!(card_table.stat_defs[2].label, "Release Date");
        match &card_table.stat_defs[2].data {
            StatArray::Date { values } => {
                assert_eq!(
                    values[0],
                    Some(
                        NaiveDate::from_ymd_opt(1999, 6, 23)
                            .unwrap()
                            .and_hms_micro_opt(0, 0, 0, 0)
                            .unwrap()
                            .into()
                    )
                );
                assert_eq!(values[14], None);
            }
            other => panic!("unexpected stat type: {:?}", other),
        };
        assert_eq!(card_table.stat_defs[3].label, "Setting");
        match &card_table.stat_defs[3].data {
            StatArray::LatLng { values } => {
                assert_eq!(values[0], None);
                assert_eq!(values[13], Some((47.6, -122.3)));
                assert_eq!(values[14], None);
            }
            other => panic!("unexpected stat type: {:?}", other),
        };
        assert_eq!(card_table.stat_defs[4].label, "Tagline");
        match &card_table.stat_defs[4].data {
            StatArray::String { values } => {
                assert_eq!(values[0], Some("Welcome to the Real World".into()));
                assert_eq!(values[14], None);
            }
            other => panic!("unexpected stat type: {:?}", other),
        };
        // serde_json::to_writer(std::io::stderr(), &card_table).unwrap();
    }

    #[test]
    fn test_parse_value_range_of_movies_missing_title_column() {
        let mut frame = movies_row_major();
        frame[0][0].clear();
        let input = transpose(frame);
        let (card_table, callouts) = parse_value_range(input);
        assert_eq!(card_table, CardTable::default());
        let warnings: Vec<_> = callouts
            .iter()
            .filter_map(|c| match c {
                Callout::Warning(s) => Some(s),
                Callout::Error(_) => None,
            })
            .collect();
        let nothing: Vec<&str> = vec![];
        assert_eq!(warnings, nothing);
        let errors: Vec<_> = callouts
            .iter()
            .filter_map(|c| match c {
                Callout::Warning(_) => None,
                Callout::Error(s) => Some(s),
            })
            .collect();
        assert_eq!(errors.len(), 1);
    }

    #[test]
    fn test_expression_eval() {
        let (card_table, _) = parse_value_range(movies());
        let expr = expr("(L\"Release Date\" - R\"Release Date\")").unwrap();
        let expr = expr.optimize(&card_table, &card_table).unwrap();
        assert_eq!(expr.get_type().unwrap(), ExprType::Number);
        assert_eq!(
            expr.get_value(0, 13)
                .unwrap()
                .map(|r| *r.get_number().unwrap()),
            Some(2261.0)
        );
        assert_eq!(
            expr.get_value(0, 14)
                .unwrap()
                .map(|r| *r.get_number().unwrap()),
            None
        );
        for i in 0..14 {
            for j in 0..14 {
                let ltr = expr
                    .get_value(i, j)
                    .unwrap()
                    .map(|r| *r.get_number().unwrap());
                let rtl = expr
                    .get_value(j, i)
                    .unwrap()
                    .map(|r| *r.get_number().unwrap());
                assert_eq!(ltr.map(|x| -x), rtl);
            }
        }
    }
}
