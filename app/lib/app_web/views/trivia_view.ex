defmodule AppWeb.TriviaView do
  use AppWeb, :view

  import App.Utils

  alias App.Entities.Party.PartyState

  def round_message(party_state, event, opts \\ [])
  def round_message(%PartyState{player_list: lst}, "round:start", _) do
    %{
      playerOrder: Enum.map(lst, &Map.fetch!(&1, :id))
    }
  end
  def round_message(%PartyState{player_list: lst}, "round:scores", _) do
    score_entries = Enum.map(lst, fn %{id: id, score: score} -> %{userId: id, score: score} end)
    %{
      scores: score_entries
    }
  end
  def round_message(%PartyState{turn_history: history}, "turn:start", _) do
    {_, saved} = find_last(history, fn {evt, _} ->
      evt == "turn:start"
    end)
    %{
      userId: saved.user_id,
      turnId: saved.turn_id,
      trivia: trivia_json(saved.trivia)
    }
    |> maybe_put_lazy(
      Map.has_key?(saved, :participant_id), :participantId, fn -> saved.participant_id end
    )
  end
  def round_message(
    %PartyState{player_list: players, turn_history: history, answers: answers},
    "turn:feedback",
    _
  ) do
    {_, %{turn_id: turn_id, trivia: trivia}} = find_last(history, fn {evt, _} ->
      evt == "turn:start"
    end)
    score_entries = Enum.map(players, fn %{id: id, score: score} -> %{userId: id, score: score} end)
    answer_entries = Enum.map(answers, fn {id, alst} -> %{userId: id, answered: alst} end)
    message = %{
      turnId: turn_id,
      scores: score_entries,
      answers: answer_entries,
      expectedAnswers: expected_answers_json(trivia.expected_answers)
    }
    maybe_put_lazy(message, not is_nil(Map.get(trivia, :stats)), :stats, fn ->
      %{
        values: trivia.stats.values,
        definition: stat_def_json(trivia.stats.definition)
      }
    end)
  end

  def nested_round_message(party_state, event, opts \\ []) do
    round_message(party_state, event, opts)
    |> Map.put(:event, event)
  end
  def round_messages(state = %PartyState{turn_history: history}) do
    event_names = case List.last(history) do
      {"turn:end", _} ->  ["round:start", "turn:start", "turn:feedback"]
      {"turn:start", _} -> ["round:start", "round:scores", "turn:start"]
      _ -> ["round:start"]
    end
    Enum.map(event_names, &nested_round_message(state, &1))
  end
  def round_messages(_nil), do: []

  def option_json(option) do
    maybe_put_lazy(
      %{id: option.id, answer: option.answer},
      Map.has_key?(option, :question_value),
      :questionValue,
      fn -> option.question_value end
    )
  end

  def trivia_json(trivia) do
    %{
      "question" => trivia.question,
      "options" => Enum.map(trivia.options, &option_json/1),
      "answerType" => trivia.answer_type,
      "minAnswers" => trivia.min_answers,
      "maxAnswers" => trivia.max_answers
    }
  end

  defp stat_def_json(stat_def) do
    %{
      label: stat_def.label,
      type: stat_def.stat_type,
      axisMod: stat_def.axis_mod,
      axisMin: stat_def.axis_min,
      axisMax: stat_def.axis_max
    }
  end

  defp expected_answers_json(expectations) do
    Enum.map(expectations, fn e ->
      Map.take(e, [:kind, :group])
      |> maybe_put_lazy(Map.has_key?(e, :min_pos), :minPos, fn -> e.min_pos end)
    end)
  end
end
