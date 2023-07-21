// Based on Alex Kladov - Simple but Powerful Pratt Parsing
// https://matklad.github.io/2020/04/13/simple-but-powerful-pratt-parsing.html

use std::{fmt, num::ParseFloatError};

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

use crate::types::{EdgeSide, NaiveDateTimeExt};

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

impl fmt::Display for UnOp {
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
    Dist,
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
            "<->" => Ok(BinOp::Dist),
            v => Err(format!("not a unary op: {:?}", v)),
        }
    }
}

impl fmt::Display for BinOp {
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
            BinOp::Dist => write!(f, "<->"),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, NifTaggedEnum)]
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

#[derive(Debug, Clone, PartialEq)]
pub struct BoxedExpression(pub(crate) Box<Expression>);

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

impl fmt::Display for Expression {
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
            tag("<->"),
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
        Some('.' | '0'..='9') => map(take_while1(|c: char| c.is_ascii_digit()), Token::Error)(inp),
        Some('a'..='z' | 'A'..='Z') => {
            map(take_while1(|c: char| c.is_alphabetic()), Token::Error)(inp)
        }
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

#[allow(clippy::let_and_return)]
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
        "+" | "-" | "<->" => (7, 8),
        "*" | "/" => (9, 10),
        "**" => (11, 12),
        _ => return None,
    };
    Some(res)
}

#[cfg(test)]
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

        let s = expr("1.0 <-> 2.0 * 3.0 * 4.0 <-> 5.0")?;
        assert_eq!(s.to_string(), "(<-> (<-> 1 (* (* 2 3) 4)) 5)");

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
