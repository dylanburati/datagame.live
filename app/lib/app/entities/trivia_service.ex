defmodule App.Entities.TriviaService do

  def get_any_trivia_impl(kb, tdefs, id_log) do
    id_to_deck = Enum.with_index(tdefs)
    |> Enum.map(fn {%{deck_id: deck_id}, id} -> {id, deck_id} end)
    |> Map.new()
    id_from_deck = Range.new(0, length(tdefs) - 1)
    |> Enum.group_by(&Map.get(id_to_deck, &1))
    boost_map = case App.Cache.lookup("TriviaService.boost_map") do
      nil ->
        Enum.with_index(id_log)
        |> Enum.map(fn {id, turns_since} -> {id, id_to_deck[id], turns_since} end)
        |> Enum.flat_map(fn {id, deck_id, turns_since} ->
          # probability for same exact question = x^3; same topic = x^2
          [{id, 0.5 * max(0, 6 - turns_since)}
           | Enum.map(id_from_deck[deck_id], &{&1, max(0, 6 - turns_since)})
          ]
        end)
        |> Enum.reduce(%{}, fn {id, amt}, acc ->
          Map.update(acc, id, amt, &(&1 + amt))
        end)
        |> Map.new(fn {id, amt} -> {id, :math.pow(5 / 6.0, amt)} end)
      cached -> cached
    end

    tdef_id = Enum.max_by(
      Range.new(0, length(tdefs) - 1),
      fn id -> :math.log(:rand.uniform()) / Map.get(boost_map, id, 1) end,
      fn -> nil end
    )
    case tdef_id do
      nil -> {:error, "No trivia definitions found"}
      id -> App.Native.get_trivia(kb, id)
    end
  end

  def get_any_trivia(id_log, _opts \\ []) do
    with {:ok, kb, tdefs} <- App.Native.cached_trivia_base() do
      get_any_trivia_impl(kb, tdefs, id_log)
    end
  end

  def grade_answers_single(expected_ans, answer_lst) do
    answer_set = MapSet.new(answer_lst)
    Enum.all?(expected_ans, fn
      {:all, %{ids: group}} ->
        Enum.all?(group, &(&1 in answer_set))
      {:none, %{ids: group}} ->
        Enum.all?(group, &(&1 not in answer_set))
      {:none_lenient, %{ids: group, max: n}} ->
        Enum.count(group, &(&1 in answer_set)) <= n
      {:any, %{ids: group}} ->
        Enum.count(group, &(&1 in answer_set)) == 1
      {:all_pos, %{ids: group, min_pos: min_pos}} ->
        answer_to_idx = Enum.with_index(answer_lst) |> Map.new()
        max_pos = min_pos + length(group) - 1
        Enum.all?(group, fn aid ->
          case Map.fetch(answer_to_idx, aid) do
            {:ok, idx} -> min_pos <= idx and idx <= max_pos
            :error -> false
          end
        end)
    end)
  end

  def grade_answers(trivia_exps, answer_map) do
    for {user_id, ans_lst} <- Map.to_list(answer_map), into: %{} do
      exp_lst = Enum.flat_map(trivia_exps, fn
        :matchrank ->
          case Enum.find(answer_map, fn {uid, _} -> uid != user_id end) do
            {_, ans2} ->
              Enum.with_index(ans2)
              |> Enum.map(fn {aid, idx} -> {:all_pos, %{ids: [aid], min_pos: idx}} end)
            _ -> []
          end
        simple -> [simple]
      end)

      {user_id, grade_answers_single(exp_lst, ans_lst)}
    end
  end
end
