defmodule App.Entities.Party.PartyState do
  @doc """
  Defines a state for one Room

  player_list: [%{id: integer, score: integer, trivia_def_ids: [integer]}]
  turn_history: [{"turn_start", TurnStartMsg} | {"turn_end", TurnEndMsg}]
      when TurnStartMsg: %{
        user_id: integer,
        turn_id: integer,
        trivia: %{
          question: String,
          options: [%{id: integer, answer: String, question_value: String | [String]}],
          answer_type: String,
          min_answers: integer,
          max_answers: integer,
          expected_answers: [
            %{kind: "all", group: [integer], min_pos: integer | undefined}
            | %{kind: "any", group: [integer]}
            | %{kind: "matchrank"}
          ]
          stats: undefined | %{
            values: [[integer, float]]
            definition: %{
              label: string,
              stat_type: "number" | "date" | "dollar_amount" | "km_distance",
              axis_mod: string | undefined
              axis_min: number | undefined
              axis_max: number | undefined
            }
          }
        }
      },
      TurnEndMsg: %{
        user_id: integer,
        turn_id: integer
      }
  1. turn:end (scores, turnId)
  2. turn:start (trivia, turnId if no turn:end)
  """

  defstruct [
    :player_list,
    :turn_history,
    :answers
  ]
end
