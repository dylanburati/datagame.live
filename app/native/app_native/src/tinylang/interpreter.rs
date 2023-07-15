use std::{borrow::Cow, cmp::Ordering, f64::consts::PI};

extern crate derive_more;
use derive_more::From;
use rustler::NifUnitEnum;
use smallvec::SmallVec;

use crate::types::{Card, CardTable, EdgeSide, NaiveDateTimeExt, StatArray};

use super::parser::{BinOp, Expression, UnOp};

trait TryOps: Sized {
    type Error;

    fn bool(self) -> Result<Self, Self::Error>;
    fn not(self) -> Result<Self, Self::Error>;
    fn neg(self) -> Result<Self, Self::Error>;
    fn eq(self, rhs: Self) -> Result<Self, Self::Error>;
    fn neq(self, rhs: Self) -> Result<Self, Self::Error>;
    fn lt(self, rhs: Self) -> Result<Self, Self::Error>;
    fn lte(self, rhs: Self) -> Result<Self, Self::Error>;
    fn gt(self, rhs: Self) -> Result<Self, Self::Error>;
    fn gte(self, rhs: Self) -> Result<Self, Self::Error>;
    fn and(self, rhs: Self) -> Result<Self, Self::Error>;
    fn or(self, rhs: Self) -> Result<Self, Self::Error>;
    fn add(self, rhs: Self) -> Result<Self, Self::Error>;
    fn sub(self, rhs: Self) -> Result<Self, Self::Error>;
    fn mul(self, rhs: Self) -> Result<Self, Self::Error>;
    fn div(self, rhs: Self) -> Result<Self, Self::Error>;
    fn pow(self, rhs: Self) -> Result<Self, Self::Error>;
    fn dist(self, rhs: Self) -> Result<Self, Self::Error>;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, NifUnitEnum)]
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

#[rustfmt::skip]
impl TryOps for ExprType {
    type Error = String;

    fn bool(self) -> Result<Self, Self::Error> {
        Ok(ExprType::Bool)
    }

    fn not(self) -> Result<Self, Self::Error> {
        Ok(ExprType::Bool)
    }

    fn neg(self) -> Result<Self, Self::Error> {
        if self == ExprType::Number {
            Ok(self)
        } else {
            Err(format!("- does not apply to ({:?})", self))
        }
    }

    fn eq(self, rhs: Self) -> Result<Self, Self::Error> {
        if self == rhs {
            Ok(ExprType::Bool)
        } else {
            Err(format!("== and != do not apply to ({:?}, {:?})", self, rhs))
        }
    }
    fn neq(self, rhs: Self) -> Result<Self, Self::Error> { self.eq(rhs) }

    fn lt(self, rhs: Self) -> Result<Self, Self::Error> {
        match self {
            lt @ (ExprType::Number | ExprType::Date) if lt == rhs => Ok(ExprType::Bool),
            _ => Err(format!(
                "<, <=, >=, and > do not apply to ({:?}, {:?})",
                self, rhs
            )),
        }
    }
    fn lte(self, rhs: Self) -> Result<Self, Self::Error> { self.lt(rhs) }
    fn gt(self, rhs: Self) -> Result<Self, Self::Error> { self.lt(rhs) }
    fn gte(self, rhs: Self) -> Result<Self, Self::Error> { self.lt(rhs) }

    fn and(self, rhs: Self) -> Result<Self, Self::Error> {
        if matches!((self, rhs), (ExprType::Bool, ExprType::Bool)) {
            Ok(ExprType::Bool)
        } else {
            Err(format!(
                "`and` and `or` do not apply to ({:?}, {:?})",
                self, rhs
            ))
        }
    }
    fn or(self, rhs: Self) -> Result<Self, Self::Error> { self.and(rhs) }

    fn add(self, rhs: Self) -> Result<Self, Self::Error> {
        if matches!((self, rhs), (ExprType::Number, ExprType::Number)) {
            Ok(ExprType::Number)
        } else {
            Err(format!(
                "+, *, /, and ** do not apply to ({:?}, {:?})",
                self, rhs
            ))
        }
    }

    fn sub(self, rhs: Self) -> Result<Self, Self::Error> {
        match self {
            lt @ (ExprType::Number | ExprType::Date) if lt == rhs => Ok(ExprType::Number),
            _ => Err(format!("- does not apply to ({:?}, {:?})", self, rhs)),
        }
    }

    fn mul(self, rhs: Self) -> Result<Self, Self::Error> { self.add(rhs) }
    fn div(self, rhs: Self) -> Result<Self, Self::Error> { self.add(rhs) }
    fn pow(self, rhs: Self) -> Result<Self, Self::Error> { self.add(rhs) }

    fn dist(self, rhs: Self) -> Result<Self, Self::Error> {
        if matches!((self, rhs), (ExprType::LatLng, ExprType::LatLng)) {
            Ok(ExprType::Number)
        } else {
            Err(format!( "<-> does not apply to ({:?}, {:?})", self, rhs ))
        }
    }
}

#[derive(Debug, Clone, PartialEq, From)]
pub enum ExprValue<'a> {
    Bool(bool),
    Number(f64),
    LatLng((f64, f64)),
    Date(NaiveDateTimeExt),
    String(Cow<'a, str>),
    IntArray(Cow<'a, [i64]>),
    StringArray(Cow<'a, [String]>),
}

impl<'a> ExprValue<'a> {
    pub fn get_bool(&self) -> Option<&bool> {
        match self {
            ExprValue::Bool(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_number(&self) -> Option<&f64> {
        match self {
            ExprValue::Number(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_lat_lng(&self) -> Option<&(f64, f64)> {
        match self {
            ExprValue::LatLng(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_date(&self) -> Option<&NaiveDateTimeExt> {
        match self {
            ExprValue::Date(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_string(&self) -> Option<&str> {
        match self {
            ExprValue::String(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_int_array(&self) -> Option<&[i64]> {
        match self {
            ExprValue::IntArray(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_string_array(&self) -> Option<&[String]> {
        match self {
            ExprValue::StringArray(v) => Some(v),
            _ => None,
        }
    }

    fn equals(&self, rhs: &ExprValue) -> Option<bool> {
        match self {
            ExprValue::Bool(lhs) => rhs.get_bool().map(|v| lhs == v),
            ExprValue::Number(lhs) => rhs.get_number().map(|v| lhs == v),
            ExprValue::LatLng(lhs) => rhs.get_lat_lng().map(|v| lhs == v),
            ExprValue::Date(lhs) => rhs.get_date().map(|v| lhs == v),
            ExprValue::String(lhs) => rhs.get_string().map(|v| lhs == v),
            ExprValue::IntArray(lhs) => rhs.get_int_array().map(|v| lhs == &v),
            ExprValue::StringArray(lhs) => rhs.get_string_array().map(|v| lhs == &v),
        }
    }

    fn cmp(&self, rhs: &ExprValue) -> Option<Ordering> {
        match self {
            ExprValue::Number(lhs) => rhs.get_number().map(|v| lhs.total_cmp(v)),
            ExprValue::Date(lhs) => rhs.get_date().map(|v| lhs.cmp(v)),
            _ => None,
        }
    }
}

#[rustfmt::skip]
impl<'a> TryOps for ExprValue<'a> {
    type Error = ();

    fn bool(self) -> Result<Self, Self::Error> {
        match self {
            ExprValue::Bool(v) => Ok(ExprValue::Bool(v)),
            _ => Ok(ExprValue::Bool(true)),
        }
    }

    fn not(self) -> Result<Self, Self::Error> {
        match self {
            ExprValue::Bool(v) => Ok(ExprValue::Bool(!v)),
            _ => Ok(ExprValue::Bool(false)),
        }
    }

    fn neg(self) -> Result<Self, Self::Error> {
        let val = self.get_number().map(|x| -*x).ok_or(())?;
        Ok(val.into())
    }

    fn eq(self, rhs: Self) -> Result<Self, Self::Error> {
        let val = self.equals(&rhs).ok_or(())?;
        Ok(val.into())
    }
    fn neq(self, rhs: Self) -> Result<Self, Self::Error> { 
        let val = self.equals(&rhs).ok_or(())?;
        Ok((!val).into())
    }

    fn lt(self, rhs: Self) -> Result<Self, Self::Error> {
        let cv = self.cmp(&rhs).ok_or(())?;
        let val = matches!(cv, Ordering::Less);
        Ok(val.into())
    }
    fn lte(self, rhs: Self) -> Result<Self, Self::Error> {
        let cv = self.cmp(&rhs).ok_or(())?;
        let val = matches!(cv, Ordering::Less | Ordering::Equal);
        Ok(val.into())
    }
    fn gt(self, rhs: Self) -> Result<Self, Self::Error> {
        let cv = self.cmp(&rhs).ok_or(())?;
        let val = matches!(cv, Ordering::Greater);
        Ok(val.into())
    }
    fn gte(self, rhs: Self) -> Result<Self, Self::Error> {
        let cv = self.cmp(&rhs).ok_or(())?;
        let val = matches!(cv, Ordering::Greater | Ordering::Equal);
        Ok(val.into())
    }

    fn and(self, rhs: Self) -> Result<Self, Self::Error> {
        let lhs = self.get_bool().ok_or(())?;
        if !lhs {
            return Ok(ExprValue::Bool(false));
        }
        Ok(rhs)
    }
    fn or(self, rhs: Self) -> Result<Self, Self::Error> {
        let lhs = self.get_bool().ok_or(())?;
        if *lhs {
            return Ok(ExprValue::Bool(true));
        }
        Ok(rhs)
    }

    fn add(self, rhs: Self) -> Result<Self, Self::Error> {
        let x1 = self.get_number().ok_or(())?;
        let x2 = rhs.get_number().ok_or(())?;
        Ok((x1 + x2).into())
    }

    fn sub(self, rhs: Self) -> Result<Self, Self::Error> {
        match self {
            ExprValue::Number(x1) => {
                let x2 = rhs.get_number().ok_or(())?;
                Ok((x1 - x2).into())
            },
            ExprValue::Date(x1) => {
                let x2 = rhs.get_date().ok_or(())?;
                let ms = x1.signed_duration_since(**x2).num_milliseconds() as f64;
                Ok((ms / 1000.0 / 60.0 / 60.0 / 24.0).into())
            },
            _ => Err(()),
        }
    }

    fn mul(self, rhs: Self) -> Result<Self, Self::Error> {
        let x1 = self.get_number().ok_or(())?;
        let x2 = rhs.get_number().ok_or(())?;
        Ok((x1 * x2).into())
    }
    fn div(self, rhs: Self) -> Result<Self, Self::Error> {
        let x1 = self.get_number().ok_or(())?;
        let x2 = rhs.get_number().ok_or(())?;
        Ok((x1 / x2).into())
    }
    fn pow(self, rhs: Self) -> Result<Self, Self::Error> {
        let x1 = self.get_number().ok_or(())?;
        let x2 = rhs.get_number().ok_or(())?;
        Ok(x1.powf(*x2).into())
    }
    
    fn dist(self, rhs: Self) -> Result<Self, Self::Error> {
        const FLATTENING: f64 = 1.0 / 298.257223563;
        const RADIUS_KM: f64 = 6378.137;
        let (mut lat1, mut lon1) = self.get_lat_lng().ok_or(())?;
        let (mut lat2, mut lon2) = rhs.get_lat_lng().ok_or(())?;
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
        let central2 = haversin(dphi) + haversin(dlambda) * (1.0 - haversin(dphi) - haversin(lat1 + lat2));
        let halfcentral = central2.sqrt().asin();
        let central = 2.0 * halfcentral;
        let p = 0.5 * (b1 + b2);
        let q = 0.5 * (b2 - b1);
        let x = (central - f64::sin(central)) * sin2(p) * cos2(q) / cos2(halfcentral);
        let y = (central + f64::sin(central)) * sin2(q) * cos2(p) / sin2(halfcentral);
        let dist_km = RADIUS_KM * (central - 0.5 * FLATTENING * (x + y));
        Ok(dist_km.into())
    }
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

pub enum IntermediateExpr<'a> {
    Number {
        value: f64,
    },
    Date {
        value: NaiveDateTimeExt,
    },
    NumberVariable {
        side: EdgeSide,
        values: DirectColumn<'a, f64>,
    },
    LatLngVariable {
        side: EdgeSide,
        values: DirectColumn<'a, (f64, f64)>,
    },
    DateVariable {
        side: EdgeSide,
        values: DirectColumn<'a, NaiveDateTimeExt>,
    },
    StringVariable {
        side: EdgeSide,
        values: StringColumn<'a>,
    },
    Unary {
        op: UnOp,
        child: Box<IntermediateExpr<'a>>,
    },
    Binary {
        op: BinOp,
        lhs: Box<IntermediateExpr<'a>>,
        rhs: Box<IntermediateExpr<'a>>,
    },
}

impl Expression {
    pub fn optimize<'a>(
        &self,
        left: &'a CardTable,
        right: &'a CardTable,
    ) -> Result<IntermediateExpr<'a>, String> {
        match self {
            Expression::Number { value } => Ok(IntermediateExpr::Number { value: *value }),
            Expression::Date { value } => Ok(IntermediateExpr::Date { value: *value }),
            Expression::Variable { side, key } => {
                if key == "Card" {
                    let data = left_or_right(side, left, right);
                    return Ok(IntermediateExpr::StringVariable {
                        side: *side,
                        values: TitleColumn(data.cards.as_slice()).into()
                    });
                }
                let mut iter = match side {
                    EdgeSide::Left => left.stat_defs.iter(),
                    EdgeSide::Right => right.stat_defs.iter(),
                };
                let col = iter
                    .find(|sd| &sd.label == key)
                    .ok_or_else(|| format!("Stat {} not found", key))?;
                match &col.data {
                    StatArray::Number { unit: _, values } => Ok(IntermediateExpr::NumberVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()),
                    }),
                    StatArray::Date { values } => Ok(IntermediateExpr::DateVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()),
                    }),
                    StatArray::String { values } => Ok(IntermediateExpr::StringVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()).into(),
                    }),
                    StatArray::LatLng { values } => Ok(IntermediateExpr::LatLngVariable {
                        side: *side,
                        values: DirectColumn(values.as_slice()),
                    }),
                }
            }
            Expression::Unary { op, child } => {
                let child = child.0.optimize(left, right)?;
                Ok(IntermediateExpr::Unary {
                    op: *op,
                    child: Box::new(child),
                })
            }
            Expression::Binary { op, lhs, rhs } => {
                let lhs = lhs.0.optimize(left, right)?;
                let rhs = rhs.0.optimize(left, right)?;
                Ok(IntermediateExpr::Binary {
                    op: *op,
                    lhs: Box::new(lhs),
                    rhs: Box::new(rhs),
                })
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

impl<'a> IntermediateExpr<'a> {
    pub fn get_type(&self) -> Result<ExprType, String> {
        match self {
            IntermediateExpr::Number { value: _ } => Ok(ExprType::Number),
            IntermediateExpr::Date { value: _ } => Ok(ExprType::Date),
            IntermediateExpr::NumberVariable { side: _, values: _ } => Ok(ExprType::Number),
            IntermediateExpr::LatLngVariable { side: _, values: _ } => Ok(ExprType::LatLng),
            IntermediateExpr::DateVariable { side: _, values: _ } => Ok(ExprType::Date),
            IntermediateExpr::StringVariable { side: _, values: _ } => Ok(ExprType::String),
            IntermediateExpr::Unary { op, child } => {
                let child_type = child.get_type()?;
                match op {
                    UnOp::Bool => child_type.bool(),
                    UnOp::Not => child_type.not(),
                    UnOp::Neg => child_type.neg(),
                }
            }
            IntermediateExpr::Binary { op, lhs, rhs } => {
                let lhs_type = lhs.get_type()?;
                let rhs_type = rhs.get_type()?;
                match op {
                    BinOp::Eq => lhs_type.eq(rhs_type),
                    BinOp::Neq => lhs_type.neq(rhs_type),
                    BinOp::Lt => lhs_type.lt(rhs_type),
                    BinOp::Lte => lhs_type.lte(rhs_type),
                    BinOp::Gt => lhs_type.gt(rhs_type),
                    BinOp::Gte => lhs_type.gte(rhs_type),
                    BinOp::And => lhs_type.and(rhs_type),
                    BinOp::Or => lhs_type.or(rhs_type),
                    BinOp::Add => lhs_type.add(rhs_type),
                    BinOp::Sub => lhs_type.sub(rhs_type),
                    BinOp::Mul => lhs_type.mul(rhs_type),
                    BinOp::Div => lhs_type.div(rhs_type),
                    BinOp::Pow => lhs_type.pow(rhs_type),
                    BinOp::Dist => lhs_type.dist(rhs_type),
                }
            }
        }
    }

    pub fn has_vars(&self, left_idx: Option<usize>, right_idx: Option<usize>) -> bool {
        match self {
            IntermediateExpr::Number { value: _ } => true,
            IntermediateExpr::Date { value: _ } => true,
            IntermediateExpr::NumberVariable { side, values } => {
                let maybe_index = left_or_right(side, left_idx, right_idx);
                if let Some(index) = maybe_index {
                    values.get(index).is_some()
                } else {
                    true
                }
            }
            IntermediateExpr::LatLngVariable { side, values } => {
                let maybe_index = left_or_right(side, left_idx, right_idx);
                if let Some(index) = maybe_index {
                    values.get(index).is_some()
                } else {
                    true
                }
            }
            IntermediateExpr::DateVariable { side, values } => {
                let maybe_index = left_or_right(side, left_idx, right_idx);
                if let Some(index) = maybe_index {
                    values.get(index).is_some()
                } else {
                    true
                }
            }
            IntermediateExpr::StringVariable { side, values } => {
                let maybe_index = left_or_right(side, left_idx, right_idx);
                if let Some(index) = maybe_index {
                    values.get(index).is_some()
                } else {
                    true
                }
            }
            IntermediateExpr::Unary { op: _, child } => child.has_vars(left_idx, right_idx),
            IntermediateExpr::Binary { op: _, lhs, rhs } => {
                lhs.has_vars(left_idx, right_idx) && rhs.has_vars(left_idx, right_idx)
            }
        }
    }

    fn get_expr_value(&self, left_idx: usize, right_idx: usize) -> Result<Option<ExprValue>, ()> {
        match self {
            IntermediateExpr::Number { value } => Ok(Some(ExprValue::Number(*value))),
            IntermediateExpr::Date { value } => Ok(Some(ExprValue::Date(*value))),
            IntermediateExpr::NumberVariable { side, values } => {
                let index = left_or_right(side, left_idx, right_idx);
                let ev = values.get(index).copied().map(ExprValue::Number);
                Ok(ev)
            }
            IntermediateExpr::LatLngVariable { side, values } => {
                let index = left_or_right(side, left_idx, right_idx);
                let ev = values.get(index).copied().map(ExprValue::LatLng);
                Ok(ev)
            }
            IntermediateExpr::DateVariable { side, values } => {
                let index = left_or_right(side, left_idx, right_idx);
                let ev = values.get(index).copied().map(ExprValue::Date);
                Ok(ev)
            }
            IntermediateExpr::StringVariable { side, values } => {
                let index = left_or_right(side, left_idx, right_idx);
                let ev = values.get(index).map(|s| ExprValue::String(s.into()));
                Ok(ev)
            }
            IntermediateExpr::Unary { op, child } => {
                if let Some(child_value) = child.get_expr_value(left_idx, right_idx)? {
                    let ev = match op {
                        UnOp::Bool => child_value.bool(),
                        UnOp::Not => child_value.not(),
                        UnOp::Neg => child_value.neg(),
                    }?;
                    Ok(Some(ev))
                } else {
                    Ok(None)
                }
            }
            IntermediateExpr::Binary { op, lhs, rhs } => {
                if let Some(lhs_value) = lhs.get_expr_value(left_idx, right_idx)? {
                    if let Some(rhs_value) = rhs.get_expr_value(left_idx, right_idx)? {
                        let ev = match op {
                            BinOp::Eq => lhs_value.eq(rhs_value),
                            BinOp::Neq => lhs_value.neq(rhs_value),
                            BinOp::Lt => lhs_value.lt(rhs_value),
                            BinOp::Lte => lhs_value.lte(rhs_value),
                            BinOp::Gt => lhs_value.gt(rhs_value),
                            BinOp::Gte => lhs_value.gte(rhs_value),
                            BinOp::And => lhs_value.and(rhs_value),
                            BinOp::Or => lhs_value.or(rhs_value),
                            BinOp::Add => lhs_value.add(rhs_value),
                            BinOp::Sub => lhs_value.sub(rhs_value),
                            BinOp::Mul => lhs_value.mul(rhs_value),
                            BinOp::Div => lhs_value.div(rhs_value),
                            BinOp::Pow => lhs_value.pow(rhs_value),
                            BinOp::Dist => lhs_value.dist(rhs_value),
                        }?;
                        return Ok(Some(ev));
                    }
                }
                Ok(None)
            }
        }
    }

    pub fn get_value(
        &self,
        left_idx: usize,
        right_idx: usize,
    ) -> Result<Option<OwnedExprValue>, ()> {
        let maybe_ev = self.get_expr_value(left_idx, right_idx)?;
        let maybe_oev = maybe_ev.map(|ev| match ev {
            ExprValue::Bool(v) => OwnedExprValue::Bool(v),
            ExprValue::Number(v) => OwnedExprValue::Number(v),
            ExprValue::LatLng(v) => OwnedExprValue::LatLng(v),
            ExprValue::Date(v) => OwnedExprValue::Date(v),
            ExprValue::String(v) => OwnedExprValue::String(v.into_owned()),
            ExprValue::IntArray(v) => OwnedExprValue::IntArray(v.into_owned()),
            ExprValue::StringArray(v) => OwnedExprValue::StringArray(SmallVec::from(&v[..])),
        });
        Ok(maybe_oev)
    }
}
