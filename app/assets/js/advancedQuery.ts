import dayjs from "dayjs";
import {
  Parser,
  Result,
  add,
  allConsuming,
  alt,
  char,
  consecutive,
  delimited,
  many,
  map,
  preceded,
  satisfy,
  tag,
  takeTill,
  takeTill1,
  terminated,
} from "./attoparsec";
import { assertUnreachable } from "./lang";

const escape = map(terminated(char("\\"), satisfy(/[\\n"]/)), (c) => {
  switch (c) {
    case "\\":
      return "\\";
    case "n":
      return "\n";
    case '"':
      return '"';
    default:
      throw new Error("Invalid escape sequence; should be unreachable");
  }
});

const quoted = delimited(
  char('"'),
  map(many(alt(add(takeTill(/[\\"]/), escape), takeTill1(/[\\"]/))), (parts) =>
    parts.join("")
  ),
  char('"')
);

export type ComparisonKind = "<" | ">" | "~" | "!~" | "=" | "!=";

const comparisonKind: Parser<string, ComparisonKind> = map(
  alt(satisfy(/[<>:=]/), tag("!="), tag("!~")),
  (c) => {
    switch (c) {
      case ":":
        return "~";
      case "<":
      case ">":
      case "=":
      case "!=":
      case "!~":
        return c;
      default:
        throw new Error(
          "Invalid comparison kind text match; should be unreachable"
        );
    }
  }
);

export type QueryFragment = {
  field: string;
  op: ComparisonKind;
  value: string;
};

const queryFragment = map(
  consecutive(
    takeTill1(/[^a-zA-Z0-9_.]/),
    comparisonKind,
    alt(quoted, takeTill1(/\s/))
  ),
  ([field, op, value]) => ({ field, op, value })
);

export const queryParser = allConsuming(
  terminated(
    many(preceded(takeTill(/[^\s]/), queryFragment)),
    takeTill(/[^\s]/)
  )
);

export function toBool(input: string): Result<boolean> {
  if (input === "true") {
    return new Result.Ok(true);
  }
  if (input === "false") {
    return new Result.Ok(false);
  }
  return new Result.Err("Not a boolean: " + input);
}

export function toInteger(input: string): Result<number> {
  const x = parseInt(input, 10);
  if (Number.isNaN(x)) {
    return new Result.Err("Not a number: " + input);
  }
  return new Result.Ok(x);
}

export function toNumber(input: string): Result<number> {
  const x = parseFloat(input);
  if (Number.isNaN(x)) {
    return new Result.Err("Not a number: " + input);
  }
  return new Result.Ok(x);
}

export function toDateAndPrecision(
  input: string
): Result<[dayjs.Dayjs, "year" | "month" | "day"]> {
  let d = dayjs(input, "YYYY");
  if (d.isValid()) {
    return new Result.Ok([d, "year"]);
  }
  d = dayjs(input, ["YYYY-MM", "MMM YYYY"]);
  if (d.isValid()) {
    return new Result.Ok([d, "month"]);
  }
  d = dayjs(input, ["YYYY-MM-DD", "MM/DD/YYYY"]);
  if (d.isValid()) {
    return new Result.Ok([d, "day"]);
  }
  return new Result.Err("Not a date: " + input);
}

type Predicate<T> = (value: T) => boolean;

function liftNegate<T>(f: Predicate<T>): Predicate<T> {
  return (x) => !f(x);
}

export type PredicateTypes = {
  boolean: Result<Predicate<boolean | null>>;
  number: Result<Predicate<number | null>>;
  date: Result<Predicate<string | null>>;
  latLng: Result<Predicate<[number | number] | null>>;
  string: Result<Predicate<string | null>>;
  ["string[]"]: Result<Predicate<string[] | null>>;
};

// For some reason this does not type narrow with a switch statement
// export function toPredicate<K extends keyof PredicateTypes>(fragment: QueryFragment, type: K): PredicateTypes[K] {

export function toPredicate(fragment: QueryFragment): PredicateTypes {
  const { op, value } = fragment;
  if (op === "!~" || op === "!=") {
    const original =
      op === "!~"
        ? toPredicate({ ...fragment, op: "~" })
        : toPredicate({ ...fragment, op: "=" });
    return {
      boolean: original.boolean.map(liftNegate),
      number: original.number.map(liftNegate),
      date: original.date.map(liftNegate),
      latLng: original.latLng.map(liftNegate),
      string: original.string.map(liftNegate),
      ["string[]"]: original["string[]"].map(liftNegate),
    };
  }
  switch (op) {
    case "=":
      return {
        ...toPredicate({ ...fragment, op: "~" }),
        string: new Result.Ok((s: string | null) => s === value),
        "string[]": new Result.Ok(
          (sl: string[] | null) => sl != null && sl.some((s) => s === value)
        ),
      };
    case "~":
      return {
        boolean: toBool(value).map(
          (bValue) => (cmp: boolean | null) => cmp === bValue
        ),
        number: toNumber(value).map(
          (fValue) => (cmp: number | null) => cmp === fValue
        ),
        latLng: new Result.Err("LatLng queries are not implemented"),
        date: toDateAndPrecision(value).map(
          ([dValue, dPrecision]) =>
            (cmpIso: string | null) => {
              if (cmpIso == null) {
                return false;
              }
              const dMin = dValue.startOf(dPrecision);
              const dMax = dValue.endOf(dPrecision);
              const cmp = dayjs(cmpIso);
              return cmp.isValid() && !cmp.isBefore(dMin) && !cmp.isAfter(dMax);
            }
        ),
        string: new Result.Ok(
          (s: string | null) =>
            s != null && s.toLowerCase().includes(value.toLowerCase())
        ),
        "string[]": new Result.Ok(
          (sl: string[] | null) =>
            sl != null &&
            sl.some((s) => s.toLowerCase().includes(value.toLowerCase()))
        ),
      };
    case "<":
      return {
        boolean: new Result.Err("Booleans do not have an order for < or >"),
        number: toNumber(value).map(
          (fValue) => (cmp: number | null) => cmp != null && cmp < fValue
        ),
        latLng: new Result.Err("LatLng queries are not implemented"),
        date: toDateAndPrecision(value).map(
          ([dValue, dPrecision]) =>
            (cmpIso: string | null) => {
              if (cmpIso == null) {
                return false;
              }
              const dMin = dValue.startOf(dPrecision);
              const cmp = dayjs(cmpIso);
              return cmp.isValid() && cmp.isBefore(dMin);
            }
        ),
        string: new Result.Ok(
          (s: string | null) =>
            s != null && s.toLowerCase() < value.toLowerCase()
        ),
        "string[]": new Result.Err(
          "String arrays do not have an order for < or >"
        ),
      };
    case ">":
      return {
        boolean: new Result.Err("Booleans do not have an order for < or >"),
        number: toNumber(value).map(
          (fValue) => (cmp: number | null) => cmp != null && cmp > fValue
        ),
        latLng: new Result.Err("LatLng queries are not implemented"),
        date: toDateAndPrecision(value).map(
          ([dValue, dPrecision]) =>
            (cmpIso: string | null) => {
              if (cmpIso == null) {
                return false;
              }
              const dMax = dValue.endOf(dPrecision);
              const cmp = dayjs(cmpIso);
              return cmp.isValid() && cmp.isAfter(dMax);
            }
        ),
        string: new Result.Ok(
          (s: string | null) =>
            s != null && s.toLowerCase() > value.toLowerCase()
        ),
        "string[]": new Result.Err(
          "String arrays do not have an order for < or >"
        ),
      };
    default:
      assertUnreachable(op);
  }
}
