// Based on Alex Kladov - Simple but Powerful Pratt Parsing
// https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html

use std::{
    cmp::Ordering,
    fmt::{self, Display},
    num::ParseFloatError,
};

use chrono::{NaiveDate, NaiveTime};
use nom::{
    branch::alt,
    bytes::complete::{escaped, tag, take_till1, take_while, take_while1},
    character::complete::{char, none_of, one_of, satisfy},
    combinator::{all_consuming, fail, map, opt, recognize},
    multi::many0,
    sequence::{delimited, preceded, terminated, tuple},
    IResult,
};
use rustler::{Decoder, Encoder, Env, NifResult, NifTaggedEnum, NifUnitEnum, Term};
use serde::{Deserialize, Serialize};

use crate::types::{CardTable, EdgeSide, NaiveDateTimeExt, StatArray};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, NifUnitEnum)]
pub enum UnOp {
    Bool,
    Not,
    Neg,
}

impl TryFrom<&str> for UnOp {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "?" => Ok(UnOp::Bool),
            "not" => Ok(UnOp::Not),
            "-" => Ok(UnOp::Neg),
            v => Err(format!("not a unary op: {:?}", v)),
        }
    }
}

impl Display for UnOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UnOp::Bool => write!(f, "?"),
            UnOp::Not => write!(f, "not"),
            UnOp::Neg => write!(f, "-"),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, NifUnitEnum)]
pub enum BinOp {
    Eq,
    Neq,
    Lt,
    Lte,
    Gt,
    Gte,
    And,
    Or,
    Add,
    Sub,
    Mul,
    Div,
    Pow,
}

impl TryFrom<&str> for BinOp {
    type Error = String;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "==" => Ok(BinOp::Eq),
            "!=" => Ok(BinOp::Neq),
            "<" => Ok(BinOp::Lt),
            "<=" => Ok(BinOp::Lte),
            ">" => Ok(BinOp::Gt),
            ">=" => Ok(BinOp::Gte),
            "and" => Ok(BinOp::And),
            "or" => Ok(BinOp::Or),
            "+" => Ok(BinOp::Add),
            "-" => Ok(BinOp::Sub),
            "*" => Ok(BinOp::Mul),
            "/" => Ok(BinOp::Div),
            "**" => Ok(BinOp::Pow),
            v => Err(format!("not a unary op: {:?}", v)),
        }
    }
}

impl Display for BinOp {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            BinOp::Eq => write!(f, "=="),
            BinOp::Neq => write!(f, "!="),
            BinOp::Lt => write!(f, "<"),
            BinOp::Lte => write!(f, "<="),
            BinOp::Gt => write!(f, ">"),
            BinOp::Gte => write!(f, ">="),
            BinOp::And => write!(f, "and"),
            BinOp::Or => write!(f, "or"),
            BinOp::Add => write!(f, "+"),
            BinOp::Sub => write!(f, "-"),
            BinOp::Mul => write!(f, "*"),
            BinOp::Div => write!(f, "/"),
            BinOp::Pow => write!(f, "**"),
        }
    }
}

#[derive(Debug, PartialEq, Serialize, Deserialize, NifTaggedEnum)]
#[serde(tag = "kind")]
pub enum Expression {
    Number {
        value: f64,
    },
    Date {
        value: NaiveDateTimeExt,
    },
    Variable {
        side: EdgeSide,
        key: String,
    },
    Unary {
        op: UnOp,
        child: BoxedExpression,
    },
    Binary {
        op: BinOp,
        lhs: BoxedExpression,
        rhs: BoxedExpression,
    },
}

#[derive(Debug, PartialEq)]
pub struct BoxedExpression(Box<Expression>);

impl From<Expression> for BoxedExpression {
    fn from(value: Expression) -> Self {
        Self(Box::new(value))
    }
}

impl Serialize for BoxedExpression {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        self.0.serialize(serializer)
    }
}

impl<'b> Deserialize<'b> for BoxedExpression {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: serde::Deserializer<'b>,
    {
        Deserialize::deserialize(deserializer).map(|e| BoxedExpression(Box::new(e)))
    }
}

impl<'b> Decoder<'b> for BoxedExpression {
    fn decode(term: Term<'b>) -> NifResult<Self> {
        let e = term.decode()?;
        Ok(Self(Box::new(e)))
    }
}

impl Encoder for BoxedExpression {
    fn encode<'a>(&self, env: Env<'a>) -> Term<'a> {
        self.0.encode(env)
    }
}

impl Display for Expression {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Expression::Number { value } => write!(f, "{}", value),
            Expression::Date { value } => write!(f, "(date {})", **value),
            Expression::Variable { side, key } => write!(f, "({:?} {})", side, key),
            Expression::Unary { op, child } => write!(f, "({} {})", op, child.0),
            Expression::Binary { op, lhs, rhs } => write!(f, "({} {} {})", op, lhs.0, rhs.0),
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Token<'a> {
    Number(&'a str),
    Str(char, &'a str),
    Op(&'a str),
    Error(&'a str),
    Eof,
}

struct Lexer<'a> {
    tokens: Vec<Token<'a>>,
}

fn digits(inp: &str) -> IResult<&str, &str> {
    take_while1(|c: char| c.is_ascii_digit())(inp)
}

fn number(inp: &str) -> IResult<&str, Token> {
    map(
        alt((recognize(tuple((opt(digits), char('.'), digits))), digits)),
        Token::Number,
    )(inp)
}

fn quoted(inp: &str) -> IResult<&str, &str> {
    delimited(
        char('"'),
        escaped(opt(none_of(r#"\""#)), '\\', one_of(r#"\"rnt"#)),
        char('"'),
    )(inp)
}

fn str(inp: &str) -> IResult<&str, Token> {
    map(
        tuple((satisfy(|c: char| c.is_ascii_alphabetic()), quoted)),
        |(c, s)| Token::Str(c, s),
    )(inp)
}

fn op(inp: &str) -> IResult<&str, Token> {
    map(
        alt((
            tag("("),
            tag(")"),
            tag("=="),
            tag("!="),
            tag("<="),
            tag("<"),
            tag(">="),
            tag(">"),
            tag("and"),
            tag("or"),
            tag("not"),
            tag("+"),
            tag("-"),
            tag("**"),
            tag("*"),
            tag("/"),
            tag("?"),
        )),
        Token::Op,
    )(inp)
}

fn error_token(inp: &str) -> IResult<&str, Token> {
    match inp.chars().next() {
        None => fail(inp),
        Some('.' | '0'..='9') => {
            map(take_while1(|c: char| c.is_ascii_digit()), Token::Error)(inp)
        }
        Some('a'..='z' | 'A'..='Z') => map(
            take_while1(|c: char| c.is_alphabetic()),
            Token::Error,
        )(inp),
        Some('"') => Ok(("", Token::Error(inp))),
        Some(_) => map(
            take_till1(|c: char| {
                c.is_ascii_whitespace() || matches!(c, 'a'..='z' | 'A'..='Z' | '.' | '0'..='9')
            }),
            Token::Error,
        )(inp),
    }
}

fn token(inp: &str) -> IResult<&str, Token> {
    alt((number, str, op, error_token))(inp)
}

fn all_tokens(inp: &str) -> IResult<&str, Vec<Token>> {
    all_consuming(preceded(
        take_while(|c: char| c.is_ascii_whitespace()),
        many0(terminated(
            token,
            take_while(|c: char| c.is_ascii_whitespace()),
        )),
    ))(inp)
}

impl<'a> Lexer<'a> {
    fn new(input: &'a str) -> Lexer<'a> {
        let (_, mut tokens) = all_tokens(input).unwrap();
        tokens.reverse();
        Lexer { tokens }
    }

    fn next(&mut self) -> Token {
        self.tokens.pop().unwrap_or(Token::Eof)
    }
    fn peek(&mut self) -> Token {
        self.tokens.last().copied().unwrap_or(Token::Eof)
    }
}

pub fn expr(input: &str) -> Result<Expression, String> {
    let mut lexer = Lexer::new(input);
    // println!("\n{}", input);
    // println!("\n{:?}", lexer.tokens);
    let re = expr_bp(&mut lexer, 0);
    // println!();
    re
}

/// Parse the expression at the head of the lexer.
///
/// Start state should be a literal, paren, or prefix operator.
/// Literal -> set as lhs
/// Paren -> consume, recurse inside to get lhs
/// Prefix op -> consume, recurse with higher min_bp to get lhs
///
/// Starting with lhs, we build an expression from the following tokens, but
/// stop before any operator with `left_bp < min_bp`. This is the rhs
/// of the above call.
///
fn expr_bp(lexer: &mut Lexer, min_bp: u8) -> Result<Expression, String> {
    let mut lhs = match lexer.next() {
        Token::Number(it) => {
            // print!("{} ", it);
            let value = it.parse().map_err(|e: ParseFloatError| e.to_string())?;
            Ok(Expression::Number { value })
        }
        Token::Str(k, it) => {
            // print!("{}\"{}\"", k, it);
            match k {
                'L' | 'l' => Ok(Expression::Variable {
                    side: EdgeSide::Left,
                    key: it.to_owned(),
                }),
                'R' | 'r' => Ok(Expression::Variable {
                    side: EdgeSide::Right,
                    key: it.to_owned(),
                }),
                'D' | 'd' => {
                    let value = NaiveDate::parse_from_str(it, "%Y-%m-%d")
                        .map_err(|e: chrono::ParseError| e.to_string())?;
                    Ok(Expression::Date {
                        value: value.and_time(NaiveTime::MIN).into(),
                    })
                }
                _ => Err("Invalid string".into()),
            }
        }
        Token::Op("(") => {
            let lhs = expr_bp(lexer, 0)?;
            if lexer.next() != Token::Op(")") {
                Err("Mismatched (".into())
            } else {
                Ok(lhs)
            }
        }
        Token::Op(op_borrow) => {
            let op = op_borrow.to_owned();
            let ((), r_bp) = prefix_binding_power(&op)?;
            let rhs = expr_bp(lexer, r_bp)?;
            // print!("{} ", op);
            op.as_str().try_into().map(|op| Expression::Unary {
                op,
                child: rhs.into(),
            })
        }
        t => Err(format!("bad token: {:?}", t)),
    }?;

    loop {
        let op = match lexer.peek() {
            Token::Eof => break,
            Token::Op(op) => Ok(op.to_owned()),
            t => Err(format!("not infix or postfix op: {:?}", t)),
        }?;

        if let Some((l_bp, ())) = postfix_binding_power(&op) {
            if l_bp < min_bp {
                break;
            }
            lexer.next();

            lhs = op.as_str().try_into().map(|op| Expression::Unary {
                op,
                child: lhs.into(),
            })?;
            continue;
        }

        if let Some((l_bp, r_bp)) = infix_binding_power(&op) {
            if l_bp < min_bp {
                break;
            }
            lexer.next();

            let rhs = expr_bp(lexer, r_bp)?;
            lhs = op.as_str().try_into().map(|op| Expression::Binary {
                op,
                lhs: lhs.into(),
                rhs: rhs.into(),
            })?;
            continue;
        }

        if matches!(op.as_str(), ")") {
            break;
        } else {
            return Err(format!("not infix or postfix op: {:?}", op));
        }
    }

    Ok(lhs)
}

fn prefix_binding_power(op: &str) -> Result<((), u8), String> {
    match op {
        "not" | "+" | "-" => Ok(((), 13)),
        _ => Err(format!("not prefix op: {:?}", op)),
    }
}

fn postfix_binding_power(op: &str) -> Option<(u8, ())> {
    let res = match op {
        "?" => (15, ()),
        _ => return None,
    };
    Some(res)
}

fn infix_binding_power(op: &str) -> Option<(u8, u8)> {
    let res = match op {
        "or" => (1, 2),
        "and" => (3, 4),
        "==" | "!=" | "<" | "<=" | ">" | ">=" => (5, 6),
        "+" | "-" => (7, 8),
        "*" | "/" => (9, 10),
        "**" => (11, 12),
        _ => return None,
    };
    Some(res)
}

mod tests {
    use crate::tinylang::expr;

    #[test]
    fn test_expr() -> Result<(), String> {
        let s = expr("1")?;
        assert_eq!(s.to_string(), "1");

        let s = expr("1 + 2 * 3")?;
        assert_eq!(s.to_string(), "(+ 1 (* 2 3))");

        let s = expr("1.0 + 2.0 * 3.0 * 4.0 + 5.0")?;
        assert_eq!(s.to_string(), "(+ (+ 1 (* (* 2 3) 4)) 5)");

        let s = expr("L\"f0\" == R\"f1\" and L\"f1\" == R\"f0\"")?;
        assert_eq!(
            s.to_string(),
            "(and (== (Left f0) (Right f1)) (== (Left f1) (Right f0)))"
        );

        let s = expr("(L\"start\" - D\"1970-01-01\") ** 2 / 365.25")?;
        assert_eq!(
            s.to_string(),
            "(/ (** (- (Left start) (date 1970-01-01 00:00:00)) 2) 365.25)"
        );

        if let Ok(s) = expr("4 == == 5") {
            panic!("{}", s.to_string());
        };

        if let Ok(s) = expr("4 not 5") {
            panic!("{}", s.to_string());
        };

        if let Ok(s) = expr("-1 3") {
            panic!("{}", s.to_string());
        };

        if let Ok(s) = expr("u\"\"") {
            panic!("{}", s.to_string());
        };

        if let Ok(s) = expr("L\"") {
            panic!("{}", s.to_string());
        };

        Ok(())
    }
}

/// EVALUATION
/// 

#[rustfmt::skip]
trait TryOps {
    type Error;

    fn bool(self) -> Result<Self, Self::Error> where Self: Sized;
    fn not(self) -> Result<Self, Self::Error> where Self: Sized;
    fn neg(self) -> Result<Self, Self::Error> where Self: Sized;
    fn eq(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn neq(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn lt(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn lte(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn gt(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn gte(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn and(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn or(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn add(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn sub(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn mul(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn div(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
    fn pow(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized;
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExprType {
    Bool,
    Number,
    Date,
    String,
}

#[rustfmt::skip]
impl TryOps for ExprType {
    type Error = String;

    fn bool(self) -> Result<Self, Self::Error> where Self: Sized {
        Ok(ExprType::Bool)
    }

    fn not(self) -> Result<Self, Self::Error> where Self: Sized {
        Ok(ExprType::Bool)
    }

    fn neg(self) -> Result<Self, Self::Error> where Self: Sized {
        if self == ExprType::Number {
            Ok(self)
        } else {
            Err(format!("- does not apply to ({:?})", self))
        }
    }

    fn eq(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        if self == rhs {
            Ok(ExprType::Bool)
        } else {
            Err(format!("== and != do not apply to ({:?}, {:?})", self, rhs))
        }
    }
    fn neq(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.eq(rhs) }

    fn lt(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        match self {
            lt @ (ExprType::Number | ExprType::Date) if lt == rhs => Ok(ExprType::Bool),
            _ => Err(format!(
                "<, <=, >=, and > do not apply to ({:?}, {:?})",
                self, rhs
            )),
        }
    }
    fn lte(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.lt(rhs) }
    fn gt(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.lt(rhs) }
    fn gte(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.lt(rhs) }

    fn and(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        if matches!((self, rhs), (ExprType::Bool, ExprType::Bool)) {
            Ok(ExprType::Bool)
        } else {
            Err(format!(
                "`and` and `or` do not apply to ({:?}, {:?})",
                self, rhs
            ))
        }
    }
    fn or(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.and(rhs) }

    fn add(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        if matches!((self, rhs), (ExprType::Number, ExprType::Number)) {
            Ok(ExprType::Number)
        } else {
            Err(format!(
                "+, *, /, and ** do not apply to ({:?}, {:?})",
                self, rhs
            ))
        }
    }

    fn sub(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        match self {
            lt @ (ExprType::Number | ExprType::Date) if lt == rhs => Ok(ExprType::Number),
            _ => Err(format!("- does not apply to ({:?}, {:?})", self, rhs)),
        }
    }

    fn mul(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.add(rhs) }
    fn div(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.add(rhs) }
    fn pow(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { self.add(rhs) }
}

#[derive(Debug, PartialEq)]
pub enum ExprValue {
    Bool(bool),
    Number(f64),
    Date(NaiveDateTimeExt),
    String(String),
}

impl ExprValue {
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

    pub fn get_date(&self) -> Option<&NaiveDateTimeExt> {
        match self {
            ExprValue::Date(v) => Some(v),
            _ => None,
        }
    }

    pub fn get_string(&self) -> Option<&String> {
        match self {
            ExprValue::String(v) => Some(v),
            _ => None,
        }
    }

    fn equals(&self, rhs: &ExprValue) -> Option<bool> {
        match self {
            ExprValue::Bool(lhs) => rhs.get_bool().map(|v| lhs == v),
            ExprValue::Number(lhs) => rhs.get_number().map(|v| lhs == v),
            ExprValue::Date(lhs) => rhs.get_date().map(|v| lhs == v),
            ExprValue::String(lhs) => rhs.get_string().map(|v| lhs == v),
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
impl TryOps for ExprValue {
    type Error = ();

    fn bool(self) -> Result<Self, Self::Error> where Self: Sized {
        match self {
            ExprValue::Bool(v) => Ok(ExprValue::Bool(v)),
            _ => Ok(ExprValue::Bool(true)),
        }
    }

    fn not(self) -> Result<Self, Self::Error> where Self: Sized {
        match self {
            ExprValue::Bool(v) => Ok(ExprValue::Bool(!v)),
            _ => Ok(ExprValue::Bool(false)),
        }
    }

    fn neg(self) -> Result<Self, Self::Error> where Self: Sized {
        self.get_number().ok_or(()).map(|x| -*x).map(ExprValue::Number)
    }

    fn eq(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.equals(&rhs).ok_or(()).map(ExprValue::Bool)
    }
    fn neq(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized { 
        self.equals(&rhs).ok_or(()).map(|b| ExprValue::Bool(!b))
    }

    fn lt(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.cmp(&rhs).ok_or(()).map(|o| matches!(o, Ordering::Less)).map(ExprValue::Bool)
    }
    fn lte(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.cmp(&rhs).ok_or(()).map(|o| !matches!(o, Ordering::Greater)).map(ExprValue::Bool)
    }
    fn gt(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.cmp(&rhs).ok_or(()).map(|o| matches!(o, Ordering::Greater)).map(ExprValue::Bool)
    }
    fn gte(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.cmp(&rhs).ok_or(()).map(|o| !matches!(o, Ordering::Less)).map(ExprValue::Bool)
    }

    fn and(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        let lhs = self.get_bool().ok_or(())?;
        if !lhs {
            return Ok(ExprValue::Bool(false));
        }
        Ok(rhs)
    }
    fn or(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        let lhs = self.get_bool().ok_or(())?;
        if *lhs {
            return Ok(ExprValue::Bool(true));
        }
        Ok(rhs)
    }

    fn add(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.get_number()
            .and_then(|lhs| { rhs.get_number().map(|x| (lhs, x)) })
            .ok_or(())
            .map(|(x, y)| x + y)
            .map(ExprValue::Number)
    }

    fn sub(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        match self {
            ExprValue::Number(lhs) => rhs.get_number().ok_or(()).map(|v| lhs - v).map(ExprValue::Number),
            ExprValue::Date(lhs) => {
                rhs.get_date().ok_or(())
                    .map(|v| {
                        let ms: f64 = lhs.signed_duration_since(**v).num_milliseconds() as f64;
                        ms / 1000.0 / 60.0 / 60.0 / 24.0
                    })
                    .map(ExprValue::Number)
            },
            _ => Err(()),
        }
    }

    fn mul(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.get_number()
            .and_then(|lhs| { rhs.get_number().map(|x| (lhs, x)) })
            .ok_or(())
            .map(|(x, y)| x * y)
            .map(ExprValue::Number)
    }
    fn div(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.get_number()
            .and_then(|lhs| { rhs.get_number().map(|x| (lhs, x)) })
            .ok_or(())
            .map(|(x, y)| x / y)
            .map(ExprValue::Number)
    }
    fn pow(self, rhs: Self) -> Result<Self, Self::Error> where Self: Sized {
        self.get_number()
            .and_then(|lhs| { rhs.get_number().map(|x| (lhs, x)) })
            .ok_or(())
            .map(|(x, y)| x.powf(*y))
            .map(ExprValue::Number)
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
        values: &'a [Option<f64>],
    },
    DateVariable {
        side: EdgeSide,
        values: &'a [Option<NaiveDateTimeExt>],
    },
    StringVariable {
        side: EdgeSide,
        values: &'a [Option<String>],
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
                let mut iter = match side {
                    EdgeSide::Left => left.stat_defs.iter(),
                    EdgeSide::Right => right.stat_defs.iter(),
                };
                let col = iter
                    .find(|sd| &sd.label == key)
                    .ok_or_else(|| format!("Stat {} not found", key))?;
                match &col.data {
                    StatArray::Number { unit: _, values } => {
                        Ok(IntermediateExpr::NumberVariable { side: *side, values: values.as_slice() })
                    },
                    StatArray::Date { values } => {
                        Ok(IntermediateExpr::DateVariable { side: *side, values: values.as_slice() })
                    },
                    StatArray::String { values } => {
                        Ok(IntermediateExpr::StringVariable { side: *side, values: values.as_slice() })
                    },
                    StatArray::LatLng { values: _ } => Err(format!(
                        "Expected stat in expression to be a Number, Date, or String; got LatLng for {}",
                        key
                    )),
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

impl<'a> IntermediateExpr<'a> {
    pub fn get_type(&self) -> Result<ExprType, String> {
        match self {
            IntermediateExpr::Number { value: _ } => Ok(ExprType::Number),
            IntermediateExpr::Date { value: _ } => Ok(ExprType::Date),
            IntermediateExpr::NumberVariable { side: _, values: _ } => Ok(ExprType::Number),
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
                }
            }
        }
    }

    pub fn get_value(&self, left_idx: usize, right_idx: usize) -> Result<Option<ExprValue>, ()> {
        match self {
            IntermediateExpr::Number { value } => Ok(Some(ExprValue::Number(*value))),
            IntermediateExpr::Date { value } => Ok(Some(ExprValue::Date(*value))),
            IntermediateExpr::NumberVariable { side, values } => {
                let index = if matches!(side, EdgeSide::Left) {
                    left_idx
                } else {
                    right_idx
                };
                let ev = values.get(index).copied().flatten().map(ExprValue::Number);
                Ok(ev)
            }
            IntermediateExpr::DateVariable { side, values } => {
                let index = if matches!(side, EdgeSide::Left) {
                    left_idx
                } else {
                    right_idx
                };
                let ev = values.get(index).copied().flatten().map(ExprValue::Date);
                Ok(ev)
            }
            IntermediateExpr::StringVariable { side, values } => {
                let index = if matches!(side, EdgeSide::Left) {
                    left_idx
                } else {
                    right_idx
                };
                let ev = values.get(index).cloned().flatten().map(ExprValue::String);
                Ok(ev)
            }
            IntermediateExpr::Unary { op, child } => {
                if let Some(child_value) = child.get_value(left_idx, right_idx)? {
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
                if let Some(lhs_value) = lhs.get_value(left_idx, right_idx)? {
                    if let Some(rhs_value) = rhs.get_value(left_idx, right_idx)? {
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
                        }?;
                        return Ok(Some(ev));
                    }
                }
                Ok(None)
            }
        }
    }
}
