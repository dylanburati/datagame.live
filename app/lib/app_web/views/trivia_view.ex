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

  defp option_stat_def_json(_pairing_or_nil, nil), do: nil
  defp option_stat_def_json(pairing_or_nil, orig_stat_def) do
    stat_def = case pairing_or_nil do
      %Pairing{} -> Pairing.aggregated_stat_def(pairing_or_nil, orig_stat_def)
      _ -> orig_stat_def
    end
    %{
      key: stat_def.key,
      label: stat_def.label,
      type: stat_def.stat_type,
      axisMod: stat_def.axis_mod,
      axisMin: stat_def.axis_min,
      axisMax: stat_def.axis_max
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
      "definitionId" => trivia_def.id,
      "question" => trivia.question,
      "options" => Enum.map(trivia.options, &option_json/1),
      "answerType" => trivia_def.answer_type,
      "minAnswers" => min_answers,
      "maxAnswers" => max_answers
    }
    |> maybe_put_lazy(
      Ecto.assoc_loaded?(trivia_def.option_stat_def),
      "statDef",
      fn -> option_stat_def_json(trivia_def.pairing, trivia_def.option_stat_def) end
    )
  end
end
