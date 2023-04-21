defmodule AppWeb.TriviaView do
  use AppWeb, :view

  import App.Utils

  def option_json(option) do
    %{id: option.id, answer: option.answer}
    |> maybe_put_lazy(
      Map.has_key?(option, :question_value),
      :questionValue,
      fn -> option.question_value end
    )
  end

  def trivia_json(trivia) do
    %{
      question: trivia.question,
      questionValueType: trivia.question_value_type,
      options: Enum.map(trivia.options, &option_json/1),
      prefilledAnswers: trivia.prefilled_answers,
      answerType: trivia.answer_type,
      minAnswers: trivia.min_answers,
      maxAnswers: trivia.max_answers
    }
  end

  def stat_def_json(stat_def) do
    %{
      label: stat_def.label,
      type: stat_def.stat_type,
      axisMod: stat_def.axis_mod,
      axisMin: stat_def.axis_min,
      axisMax: stat_def.axis_max
    }
  end

  def expected_answers_json(expectations) do
    Enum.map(expectations, fn e ->
      Map.take(e, [:kind, :group])
      |> maybe_put_lazy(Map.has_key?(e, :min_pos), :minPos, fn -> e.min_pos end)
    end)
  end
end
