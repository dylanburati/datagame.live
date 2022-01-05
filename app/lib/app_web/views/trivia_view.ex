defmodule AppWeb.TriviaView do
  use AppWeb, :view

  import App.Utils

  alias App.Repo
  alias App.Entities.Pairing

  def option_json(option) do
    %{
      answer: option.answer,
      popularity: Map.get(option, :popularity),
      inSelection: option.in_selection,
      questionValue: option.question_value
    }
  end

  def trivia_json(trivia_def, trivia) do
    trivia_def = trivia_def |> Repo.preload([:pairing])
    min_answers = case trivia_def.answer_type do
      "selection" -> trivia_def.selection_min_true
      "matchrank" -> trivia_def.selection_length
      "stat." <> stat_sel ->
        if stat_sel in ["asc", "desc"], do: trivia_def.selection_length, else: 1
    end
    max_answers = case trivia_def.answer_type do
      "selection" -> trivia_def.selection_max_true
      _ -> min_answers
    end
    %{
      "question" => trivia.question,
      "options" => Enum.map(trivia.options, &option_json/1),
      "answerType" => trivia_def.answer_type,
      "minAnswers" => min_answers,
      "maxAnswers" => max_answers
    }
    |> maybe_put_lazy(Ecto.assoc_loaded?(trivia_def.option_stat_def), "statDef", fn ->
      case trivia_def.option_stat_def do
        %{key: k, label: label, stat_type: typ} ->
          with (pairing = %Pairing{}) <- trivia_def.pairing,
               %{"agg" => aggs} <- pairing.criteria,
               {:ok, funcname} <- Map.fetch(aggs, k) do
            case funcname do
              "geodist" -> %{"label" => "Distance", "type" => "km_distance"}
            end
          else
            _ -> %{"label" => label, "type" => typ}
          end
        _ -> nil
      end
    end)
  end
end
