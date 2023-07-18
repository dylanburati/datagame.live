use std::{borrow::Cow, cmp::Ordering, f64::consts::PI};

extern crate derive_more;
use derive_more::{Display, From};
use rustler::NifUnitEnum;
use smallvec::SmallVec;

use crate::types::{Card, CardTable, EdgeSide, NaiveDateTimeExt, StatArray};

use super::parser::{BinOp, Expression, UnOp};

#[derive(Debug, Display, Clone, Copy, PartialEq, Eq, NifUnitEnum)]
pub enum ExprType {
    Bool,
    Number,
    LatLng,
    Date,
    String,
    #[allow(dead_code)]
    IntArray,
    #[allow(dead_code)]
    StringArray,
}

#[derive(Debug, Clone, PartialEq, From)]
pub enum OwnedExprValue {
    Bool(bool),
    Number(f64),
    LatLng((f64, f64)),
    Date(NaiveDateTimeExt),
    String(String),
    IntArray(Vec<i64>),
    StringArray(SmallVec<[String; 2]>),
}

trait ColumnGet<'a, T> {
    fn get(&'a self, index: usize) -> Option<&'a T>;
}

pub struct DirectColumn<'a, T>(&'a [Option<T>]);

impl<'a, T> ColumnGet<'a, T> for DirectColumn<'a, T> {
    fn get(&'a self, index: usize) -> Option<&'a T> {
        self.0.get(index).and_then(Option::as_ref)
    }
}

pub struct TitleColumn<'a>(&'a [Card]);

impl<'a> ColumnGet<'a, String> for TitleColumn<'a> {
    fn get(&'a self, index: usize) -> Option<&'a String> {
        self.0.get(index).map(|c| &c.title)
    }
}

#[derive(From)]
pub enum StringColumn<'a> {
    Direct(DirectColumn<'a, String>),
    Title(TitleColumn<'a>),
}

impl<'a> ColumnGet<'a, String> for StringColumn<'a> {
    fn get(&'a self, index: usize) -> Option<&'a String> {
        match self {
            StringColumn::Direct(inner) => inner.get(index),
            StringColumn::Title(inner) => inner.get(index),
        }
    }
}

#[derive(Debug, Clone, Copy)]
struct EvalContext {
    left_idx: usize,
    right_idx: usize,
}

#[derive(Debug, Clone, Copy)]
pub enum PartialContext {
    Left(usize),
    Right(usize),
}

trait Evaluate<'a, T> {
    fn evaluate(&'a self, ctx: EvalContext) -> Option<T>;
    fn has_vars(&'a self, ctx: &PartialContext) -> bool;
}

enum IBool<'a> {
    NotNilBool {
        child: Box<IBool<'a>>,
    },
    NotNilNumber {
        child: Box<INumber<'a>>,
    },
    NotNilLatLng {
        child: Box<ILatLng<'a>>,
    },
    NotNilDate {
        child: Box<IDate<'a>>,
    },
    NotNilString {
        child: Box<IString<'a>>,
    },
    Not {
        child: Box<IBool<'a>>,
    },
    EqBool {
        lhs: Box<IBool<'a>>,
        rhs: Box<IBool<'a>>,
        invert: bool,
    },
    EqNumber {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
        invert: bool,
    },
    EqLatLng {
        lhs: Box<ILatLng<'a>>,
        rhs: Box<ILatLng<'a>>,
        invert: bool,
    },
    EqDate {
        lhs: Box<IDate<'a>>,
        rhs: Box<IDate<'a>>,
        invert: bool,
    },
    EqString {
        lhs: Box<IString<'a>>,
        rhs: Box<IString<'a>>,
        invert: bool,
    },
    CmpNumber {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
        ordering: Ordering,
        invert: bool,
    },
    CmpDate {
        lhs: Box<IDate<'a>>,
        rhs: Box<IDate<'a>>,
        ordering: Ordering,
        invert: bool,
    },
    And {
        lhs: Box<IBool<'a>>,
        rhs: Box<IBool<'a>>,
    },
    Or {
        lhs: Box<IBool<'a>>,
        rhs: Box<IBool<'a>>,
    },
}

enum INumber<'a> {
    Number {
        value: f64,
    },
    NumberVariable {
        side: EdgeSide,
        values: DirectColumn<'a, f64>,
    },
    Neg {
        child: Box<INumber<'a>>,
    },
    Add {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
    },
    SubNumber {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
    },
    SubDate {
        lhs: Box<IDate<'a>>,
        rhs: Box<IDate<'a>>,
    },
    Mul {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
    },
    Div {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
    },
    Pow {
        lhs: Box<INumber<'a>>,
        rhs: Box<INumber<'a>>,
    },
    Dist {
        lhs: Box<ILatLng<'a>>,
        rhs: Box<ILatLng<'a>>,
    },
}

enum ILatLng<'a> {
    LatLngVariable {
        side: EdgeSide,
        values: DirectColumn<'a, (f64, f64)>,
    },
}

enum IDate<'a> {
    Date {
        value: NaiveDateTimeExt,
    },
    DateVariable {
        side: EdgeSide,
        values: DirectColumn<'a, NaiveDateTimeExt>,
    },
}

enum IString<'a> {
    StringVariable {
        side: EdgeSide,
        values: StringColumn<'a>,
    },
}

impl Evaluate<'_, bool> for IBool<'_> {
    fn evaluate(&self, ctx: EvalContext) -> Option<bool> {
        match self {
            IBool::NotNilBool { child } => Some(
                child.has_vars(&PartialContext::Left(ctx.left_idx))
                    && child.has_vars(&PartialContext::Right(ctx.right_idx)),
            ),
            IBool::NotNilNumber { child } => Some(
                child.has_vars(&PartialContext::Left(ctx.left_idx))
                    && child.has_vars(&PartialContext::Right(ctx.right_idx)),
            ),
            IBool::NotNilLatLng { child } => Some(
                child.has_vars(&PartialContext::Left(ctx.left_idx))
                    && child.has_vars(&PartialContext::Right(ctx.right_idx)),
            ),
            IBool::NotNilDate { child } => Some(
                child.has_vars(&PartialContext::Left(ctx.left_idx))
                    && child.has_vars(&PartialContext::Right(ctx.right_idx)),
            ),
            IBool::NotNilString { child } => Some(
                child.has_vars(&PartialContext::Left(ctx.left_idx))
                    && child.has_vars(&PartialContext::Right(ctx.right_idx)),
            ),
            IBool::Not { child } => child.evaluate(ctx).map(|x| !x),
            IBool::EqBool { lhs, rhs, invert } => {
                Some(*invert != (lhs.evaluate(ctx)? == rhs.evaluate(ctx)?))
            }
            IBool::EqNumber { lhs, rhs, invert } => {
                Some(*invert != (lhs.evaluate(ctx)? == rhs.evaluate(ctx)?))
            }
            IBool::EqLatLng { lhs, rhs, invert } => {
                Some(*invert != (lhs.evaluate(ctx)? == rhs.evaluate(ctx)?))
            }
            IBool::EqDate { lhs, rhs, invert } => {
                Some(*invert != (lhs.evaluate(ctx)? == rhs.evaluate(ctx)?))
            }
            IBool::EqString { lhs, rhs, invert } => {
                Some(*invert != (lhs.evaluate(ctx)? == rhs.evaluate(ctx)?))
            }
            IBool::CmpNumber {
                lhs,
                rhs,
                ordering,
                invert,
            } => {
                let lv = lhs.evaluate(ctx)?;
                let rv = rhs.evaluate(ctx)?;
                Some(*invert != (lv.total_cmp(&rv) == *ordering))
            }
            IBool::CmpDate {
                lhs,
                rhs,
                ordering,
                invert,
            } => {
                let lv = lhs.evaluate(ctx)?;
                let rv = rhs.evaluate(ctx)?;
                Some(*invert != (lv.cmp(&rv) == *ordering))
            }
            IBool::And { lhs, rhs } => Some(lhs.evaluate(ctx)? && rhs.evaluate(ctx)?),
            IBool::Or { lhs, rhs } => Some(lhs.evaluate(ctx)? || rhs.evaluate(ctx)?),
        }
    }

    fn has_vars(&self, ctx: &PartialContext) -> bool {
        match self {
            IBool::NotNilBool { child: _ } => true,
            IBool::NotNilNumber { child: _ } => true,
            IBool::NotNilLatLng { child: _ } => true,
            IBool::NotNilDate { child: _ } => true,
            IBool::NotNilString { child: _ } => true,
            IBool::Not { child } => child.has_vars(ctx),
            IBool::EqBool { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::EqNumber { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::EqLatLng { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::EqDate { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::EqString { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::CmpNumber { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::CmpDate { lhs, rhs, .. } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::And { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            IBool::Or { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
        }
    }
}

impl Evaluate<'_, f64> for INumber<'_> {
    fn evaluate(&self, ctx: EvalContext) -> Option<f64> {
        match self {
            INumber::Number { value } => Some(*value),
            INumber::NumberVariable { side, values } => values
                .get(left_or_right(side, ctx.left_idx, ctx.right_idx))
                .copied(),
            INumber::Neg { child } => child.evaluate(ctx).map(|x| -x),
            INumber::Add { lhs, rhs } => Some(lhs.evaluate(ctx)? + rhs.evaluate(ctx)?),
            INumber::SubNumber { lhs, rhs } => Some(lhs.evaluate(ctx)? - rhs.evaluate(ctx)?),
            INumber::SubDate { lhs, rhs } => {
                let lv = lhs.evaluate(ctx)?;
                let rv = rhs.evaluate(ctx)?;
                let ms = lv.signed_duration_since(*rv).num_milliseconds() as f64;
                Some(ms / 1000.0 / 60.0 / 60.0 / 24.0)
            }
            INumber::Mul { lhs, rhs } => Some(lhs.evaluate(ctx)? * rhs.evaluate(ctx)?),
            INumber::Div { lhs, rhs } => Some(lhs.evaluate(ctx)? / rhs.evaluate(ctx)?),
            INumber::Pow { lhs, rhs } => {
                let lv = lhs.evaluate(ctx)?;
                let rv = rhs.evaluate(ctx)?;
                Some(lv.powf(rv))
            }
            INumber::Dist { lhs, rhs } => {
                const FLATTENING: f64 = 1.0 / 298.257223563;
                const RADIUS_KM: f64 = 6378.137;
                let (mut lat1, mut lon1) = lhs.evaluate(ctx)?;
                let (mut lat2, mut lon2) = rhs.evaluate(ctx)?;
                lat1 *= PI / 180.0;
                lon1 *= PI / 180.0;
                lat2 *= PI / 180.0;
                lon2 *= PI / 180.0;

                #[inline]
                fn haversin(x: f64) -> f64 {
                    let res = f64::sin(x / 2.0);
                    res * res
                }
                #[inline]
                fn sin2(x: f64) -> f64 {
                    let res = f64::sin(x);
                    res * res
                }
                #[inline]
                fn cos2(x: f64) -> f64 {
                    let res = f64::cos(x);
                    res * res
                }

                // lambert's formula
                let b1 = f64::atan((1.0 - FLATTENING) * lat1.tan());
                let b2 = f64::atan((1.0 - FLATTENING) * lat2.tan());
                let dlambda = f64::abs(lon1 - lon2);
                let dphi = f64::abs(b1 - b2);
                let central2 = haversin(dphi)
                    + haversin(dlambda) * (1.0 - haversin(dphi) - haversin(lat1 + lat2));
                let halfcentral = central2.sqrt().asin();
                let central = 2.0 * halfcentral;
                let p = 0.5 * (b1 + b2);
                let q = 0.5 * (b2 - b1);
                let x = (central - f64::sin(central)) * sin2(p) * cos2(q) / cos2(halfcentral);
                let y = (central + f64::sin(central)) * sin2(q) * cos2(p) / sin2(halfcentral);
                let dist_km = RADIUS_KM * (central - 0.5 * FLATTENING * (x + y));
                Some(dist_km)
            }
        }
    }

    fn has_vars(&self, ctx: &PartialContext) -> bool {
        match self {
            INumber::Number { value: _ } => true,
            INumber::NumberVariable { side, values } => match (ctx, side) {
                (PartialContext::Left(i), EdgeSide::Left) => values.get(*i).is_some(),
                (PartialContext::Right(i), EdgeSide::Right) => values.get(*i).is_some(),
                _ => true,
            },
            INumber::Neg { child } => child.has_vars(ctx),
            INumber::Add { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            INumber::SubNumber { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            INumber::SubDate { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            INumber::Mul { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            INumber::Div { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            INumber::Pow { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
            INumber::Dist { lhs, rhs } => lhs.has_vars(ctx) && rhs.has_vars(ctx),
        }
    }
}

impl Evaluate<'_, (f64, f64)> for ILatLng<'_> {
    fn evaluate(&self, ctx: EvalContext) -> Option<(f64, f64)> {
        match self {
            ILatLng::LatLngVariable { side, values } => values
                .get(left_or_right(side, ctx.left_idx, ctx.right_idx))
                .copied(),
        }
    }

    fn has_vars(&self, ctx: &PartialContext) -> bool {
        match self {
            ILatLng::LatLngVariable { side, values } => match (ctx, side) {
                (PartialContext::Left(i), EdgeSide::Left) => values.get(*i).is_some(),
                (PartialContext::Right(i), EdgeSide::Right) => values.get(*i).is_some(),
                _ => true,
            },
        }
    }
}

impl Evaluate<'_, NaiveDateTimeExt> for IDate<'_> {
    fn evaluate(&self, ctx: EvalContext) -> Option<NaiveDateTimeExt> {
        match self {
            IDate::Date { value } => Some(*value),
            IDate::DateVariable { side, values } => values
                .get(left_or_right(side, ctx.left_idx, ctx.right_idx))
                .copied(),
        }
    }

    fn has_vars(&self, ctx: &PartialContext) -> bool {
        match self {
            IDate::Date { value: _ } => true,
            IDate::DateVariable { side, values } => match (ctx, side) {
                (PartialContext::Left(i), EdgeSide::Left) => values.get(*i).is_some(),
                (PartialContext::Right(i), EdgeSide::Right) => values.get(*i).is_some(),
                _ => true,
            },
        }
    }
}

impl<'a> Evaluate<'a, Cow<'a, str>> for IString<'a> {
    fn evaluate(&'a self, ctx: EvalContext) -> Option<Cow<'a, str>> {
        match self {
            IString::StringVariable { side, values } => values
                .get(left_or_right(side, ctx.left_idx, ctx.right_idx))
                .map(|x| x.into()),
        }
    }

    fn has_vars(&self, ctx: &PartialContext) -> bool {
        match self {
            IString::StringVariable { side, values } => match (ctx, side) {
                (PartialContext::Left(i), EdgeSide::Left) => values.get(*i).is_some(),
                (PartialContext::Right(i), EdgeSide::Right) => values.get(*i).is_some(),
                _ => true,
            },
        }
    }
}

#[derive(From)]
enum IExpr<'a> {
    Bool(IBool<'a>),
    Number(INumber<'a>),
    LatLng(ILatLng<'a>),
    Date(IDate<'a>),
    String(IString<'a>),
}

#[derive(From)]
pub struct IntermediateExpr<'a>(IExpr<'a>);

impl Expression {
    pub fn optimize<'a>(
        &self,
        left: &'a CardTable,
        right: &'a CardTable,
    ) -> Result<IntermediateExpr<'a>, String> {
        Ok(self.optimize_impl(left, right)?.into())
    }

    fn optimize_impl<'a>(
        &self,
        left: &'a CardTable,
        right: &'a CardTable,
    ) -> Result<IExpr<'a>, String> {
        match self {
            Expression::Number { value } => Ok(INumber::Number { value: *value }.into()),
            Expression::Date { value } => Ok(IDate::Date { value: *value }.into()),
            Expression::Variable { side, key } => {
                if key == "Card" {
                    let data: &CardTable = left_or_right(side, left, right);
                    let ie = IString::StringVariable {
                        side: *side,
                        values: TitleColumn(data.cards.as_slice()).into(),
                    };
                    return Ok(ie.into());
                }
                let mut iter = match side {
                    EdgeSide::Left => left.stat_defs.iter(),
                    EdgeSide::Right => right.stat_defs.iter(),
                };
                let col = iter
                    .find(|sd| &sd.label == key)
                    .ok_or_else(|| format!("Stat {} not found", key))?;
                let ie = match &col.data {
                    StatArray::Number { unit: _, values } => (INumber::NumberVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()),
                    })
                    .into(),
                    StatArray::Date { values } => (IDate::DateVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()),
                    })
                    .into(),
                    StatArray::String { values } => (IString::StringVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()).into(),
                    })
                    .into(),
                    StatArray::LatLng { values } => (ILatLng::LatLngVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()),
                    })
                    .into(),
                };
                Ok(ie)
            }
            Expression::Unary { op, child } => {
                let ce = child.0.optimize_impl(left, right)?;
                match op {
                    UnOp::Bool => match ce {
                        IExpr::Bool(child) => Ok(IBool::NotNilBool {
                            child: Box::new(child),
                        }
                        .into()),
                        IExpr::Number(child) => Ok(IBool::NotNilNumber {
                            child: Box::new(child),
                        }
                        .into()),
                        IExpr::LatLng(child) => Ok(IBool::NotNilLatLng {
                            child: Box::new(child),
                        }
                        .into()),
                        IExpr::Date(child) => Ok(IBool::NotNilDate {
                            child: Box::new(child),
                        }
                        .into()),
                        IExpr::String(child) => Ok(IBool::NotNilString {
                            child: Box::new(child),
                        }
                        .into()),
                    },
                    UnOp::Not => match ce {
                        IExpr::Bool(child) => Ok(IBool::Not {
                            child: Box::new(child),
                        }
                        .into()),
                        other => Err(format!("`not` is not defined for ({})", other.ty())),
                    },
                    UnOp::Neg => match ce {
                        IExpr::Number(child) => Ok(INumber::Neg {
                            child: Box::new(child),
                        }
                        .into()),
                        other => Err(format!("`-` is not defined for ({})", other.ty())),
                    },
                }
            }
            Expression::Binary { op, lhs, rhs } => {
                let lhs = lhs.0.optimize_impl(left, right)?;
                let rhs = rhs.0.optimize_impl(left, right)?;
                match op {
                    op @ (BinOp::Eq | BinOp::Neq) => {
                        let invert = matches!(op, BinOp::Neq);
                        match (lhs, rhs) {
                            (IExpr::Bool(left), IExpr::Bool(right)) => Ok(IBool::EqBool {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                invert,
                            }
                            .into()),
                            (IExpr::Number(left), IExpr::Number(right)) => Ok(IBool::EqNumber {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                invert,
                            }
                            .into()),
                            (IExpr::LatLng(left), IExpr::LatLng(right)) => Ok(IBool::EqLatLng {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                invert,
                            }
                            .into()),
                            (IExpr::Date(left), IExpr::Date(right)) => Ok(IBool::EqDate {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                invert,
                            }
                            .into()),
                            (IExpr::String(left), IExpr::String(right)) => Ok(IBool::EqString {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                invert,
                            }
                            .into()),
                            (l, r) => Err(format!(
                                "`{}` is not defined for ({}, {})",
                                op,
                                l.ty(),
                                r.ty()
                            )),
                        }
                    }
                    op @ (BinOp::Lt | BinOp::Lte | BinOp::Gt | BinOp::Gte) => {
                        let (ordering, invert) = match op {
                            BinOp::Lt => (Ordering::Less, false),
                            BinOp::Lte => (Ordering::Greater, true),
                            BinOp::Gt => (Ordering::Greater, false),
                            BinOp::Gte => (Ordering::Less, true),
                            _ => panic!(),
                        };
                        match (lhs, rhs) {
                            (IExpr::Number(left), IExpr::Number(right)) => Ok(IBool::CmpNumber {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                ordering,
                                invert,
                            }
                            .into()),
                            (IExpr::Date(left), IExpr::Date(right)) => Ok(IBool::CmpDate {
                                lhs: Box::new(left),
                                rhs: Box::new(right),
                                ordering,
                                invert,
                            }
                            .into()),
                            (l, r) => Err(format!(
                                "`{}` is not defined for ({}, {})",
                                op,
                                l.ty(),
                                r.ty()
                            )),
                        }
                    }
                    BinOp::And => match (lhs, rhs) {
                        (IExpr::Bool(left), IExpr::Bool(right)) => Ok(IBool::And {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`and` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Or => match (lhs, rhs) {
                        (IExpr::Bool(left), IExpr::Bool(right)) => Ok(IBool::Or {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`or` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Add => match (lhs, rhs) {
                        (IExpr::Number(left), IExpr::Number(right)) => Ok(INumber::Add {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`+` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Sub => match (lhs, rhs) {
                        (IExpr::Number(left), IExpr::Number(right)) => Ok(INumber::SubNumber {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (IExpr::Date(left), IExpr::Date(right)) => Ok(INumber::SubDate {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`-` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Mul => match (lhs, rhs) {
                        (IExpr::Number(left), IExpr::Number(right)) => Ok(INumber::Mul {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`*` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Div => match (lhs, rhs) {
                        (IExpr::Number(left), IExpr::Number(right)) => Ok(INumber::Div {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`/` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Pow => match (lhs, rhs) {
                        (IExpr::Number(left), IExpr::Number(right)) => Ok(INumber::Pow {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`**` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                    BinOp::Dist => match (lhs, rhs) {
                        (IExpr::LatLng(left), IExpr::LatLng(right)) => Ok(INumber::Dist {
                            lhs: Box::new(left),
                            rhs: Box::new(right),
                        }
                        .into()),
                        (l, r) => Err(format!("`+` is not defined for ({}, {})", l.ty(), r.ty())),
                    },
                }
            }
        }
    }
}

#[inline]
fn left_or_right<T>(side: &EdgeSide, left: T, right: T) -> T {
    match side {
        EdgeSide::Left => left,
        EdgeSide::Right => right,
    }
}

impl<'a> IExpr<'a> {
    pub fn ty(&self) -> ExprType {
        match self {
            IExpr::Bool(_) => ExprType::Bool,
            IExpr::Number(_) => ExprType::Number,
            IExpr::LatLng(_) => ExprType::LatLng,
            IExpr::Date(_) => ExprType::Date,
            IExpr::String(_) => ExprType::String,
        }
    }
}

impl<'a> IntermediateExpr<'a> {
    pub fn get_type(&self) -> ExprType {
        self.0.ty()
    }

    pub fn has_vars(&self, ctx: &PartialContext) -> bool {
        match &self.0 {
            IExpr::Bool(inner) => inner.has_vars(ctx),
            IExpr::Number(inner) => inner.has_vars(ctx),
            IExpr::LatLng(inner) => inner.has_vars(ctx),
            IExpr::Date(inner) => inner.has_vars(ctx),
            IExpr::String(inner) => inner.has_vars(ctx),
        }
    }

    pub fn get_value(&self, left_idx: usize, right_idx: usize) -> Option<OwnedExprValue> {
        let ctx = EvalContext {
            left_idx,
            right_idx,
        };
        match &self.0 {
            IExpr::Bool(inner) => inner.evaluate(ctx).map(OwnedExprValue::Bool),
            IExpr::Number(inner) => inner.evaluate(ctx).map(OwnedExprValue::Number),
            IExpr::LatLng(inner) => inner.evaluate(ctx).map(OwnedExprValue::LatLng),
            IExpr::Date(inner) => inner.evaluate(ctx).map(OwnedExprValue::Date),
            IExpr::String(inner) => inner
                .evaluate(ctx)
                .map(|x| OwnedExprValue::String(x.into_owned())),
        }
    }
}
