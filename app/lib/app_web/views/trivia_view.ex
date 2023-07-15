defmodule AppWeb.TriviaView do
  use AppWeb, :view

  import App.Utils

  def question_value_type_json(:date), do: "date"
  def question_value_type_json(:number), do: "number"
  def question_value_type_json(:string), do: "string"
  def question_value_type_json(:int_array), do: "number[]"
  def question_value_type_json(:string_array), do: "string[]"

  def answer_type_json(:selection), do: "selection"
  def answer_type_json(:hangman), do: "hangman"
  def answer_type_json({:ranking, :min}), do: "stat.min"
  def answer_type_json({:ranking, :asc}), do: "stat.asc"
  def answer_type_json({:ranking, :max}), do: "stat.max"
  def answer_type_json({:ranking, :desc}), do: "stat.desc"

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
      questionValueType: question_value_type_json(trivia.question_value_type),
      options: Enum.map(trivia.options, &option_json/1),
      prefilledAnswers: Enum.map(trivia.prefilled_answers, &option_json/1),
      answerType: answer_type_json(trivia.answer_type),
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
    Enum.map(expectations, fn {kind, e} ->
      result = Map.put(e, :kind, kind)
      {min_pos, result} = Map.pop(result, :min_pos)
      if is_nil(min_pos), do: result, else: Map.put(result, :minPos, min_pos)
    end)
  end

  def render("trivia_explore.json", %{trivia: trv, expectations: exps}) do
    %{trivia: trivia_json(trv), expectations: expected_answers_json(exps)}
  end
end
