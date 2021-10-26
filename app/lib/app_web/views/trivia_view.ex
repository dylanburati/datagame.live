defmodule AppWeb.TriviaView do
  use AppWeb, :view

  import App.Utils

  def option_json(option) do
    %{
      answer: option.answer,
      popularity: Map.get(option, :popularity),
      inSelection: option.in_selection,
      questionValue: option.question_value
    }
  end

  def trivia_json(trivia_def, trivia) do
    %{
      "question" => trivia.question,
      "options" => Enum.map(trivia.options, &option_json/1),
      "answerType" => trivia_def.answer_type,
      "minAnswers" => trivia_def.selection_min_true,
      "maxAnswers" => trivia_def.selection_min_true,
    }
    |> maybe_put_lazy(Ecto.assoc_loaded?(trivia_def.option_stat_def), "statDef", fn ->
      case trivia_def.option_stat_def do
        %{label: label, stat_type: typ} -> %{"label" => label, "type" => typ}
        _ -> nil
      end
    end)
  end
end
