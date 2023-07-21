## Short-term

- Improve sheets
  - Rework meta block (Column, Label, Y-Axis)
    - Columns `(Category|Tag|Stat)[0-9]` should instead be named `<label>: (Category|Tag|Stat)`
    - `Stat[T]` to point out numbers and dates explicitly could be an optional feature
    - Last column of data block ends in `...` -> second row is also header
      - under Stats: Y-Axis options, units
      - under Tags: delimiter

- Data exploration / ad-hoc trivia gen on website

- Allow `Pairing` to go between two decks
  - Could eventually replace tags like Film.Director
    - After expanding the People deck, could add an option in the sheet to limit
      the primary region of the deck to N rows

- Settings
  - miles or km

- New deck: Events
  - Trivia: order by time, choose correct location, choose all before YYYY...

## Long-term

- Rewrite `TriviaLoader` and `PairingService` in Gleam or Rust
  - Load from Postgres into memory once, and query a list/Vec
    - 3 Postgres queries need to run: question, right answers, wrong answers
    - Should be faster to fill in those 3 during an iteration via `reduce_while` or
      an equivalent
  - Bookmark: [Rustler](https://github.com/rusterlium/rustler)

- Mini-language to control the generation of plausible pairing instances
  - Ability to reject pair, or to give score adjustment
    - Idea: Score is really `fn Score(LEFT: Card, RIGHT: card) -> Option<f64>`
      This needs to be applied after the difficulty-popularity score is
      calculated, because question difficulty doesn't
  - Ability to filter the left and right pools independently
    - Idea: early evaluate expressions that only depend on `LEFT` or `RIGHT`.
      Treat type annotation as an implicit "coerce to type, else return None"
  - Tutorial bookmarks: [Resilient parsing](https://matklad.github.io/2023/05/21/resilient-ll-parsing-tutorial.html),
    [Bolt type checker](https://mukulrathi.com/create-your-own-programming-language/intro-to-type-checking/)

```
// Example: Sports player contemporaries
//
// given: type Team = { name: string; league: string; }
Score {
  let teams1: Team[] = LEFT["Sports teams"]
  let teams2: Team[] = RIGHT["Sports teams"]
  let b1: Date = LEFT["Birth date"]
  let b2: Date = RIGHT["Birth date"]
  if intersection(map(teams1, $it.league), map(teams2, $it.league)) == [] {
    return None
  }
  return max(-9, -0.01 * durationYears(b2 - b1) ** 2)
}
// -- break --
// Example: cities
Stat("Distance"): number {
  let coords1: Coords = LEFT["Coordinates"]
  let coords2: Coords = RIGHT["Coordinates"]
  return geodist(coords1, coords2)
}
```
