defmodule App.Entities.TriviaService do

  import Ecto.Query
  import App.Entities.Card, only: [column_map: 0]
  import App.Utils, only: [cascade_error: 1]

  alias App.Repo
  alias App.Entities.CardStatDef
  alias App.Entities.Pairing
  alias App.Entities.TriviaDef
  alias App.Entities.Trivia.TriviaLoader
  alias App.Entities.Trivia.CardQuestionCardOptions
  alias App.Entities.Trivia.CardQuestionStatOptions
  alias App.Entities.Trivia.CardQuestionTagOptions
  alias App.Entities.Trivia.PairingQuestionCardOptions
  alias App.Entities.Trivia.PairingQuestionStatOptions
  alias App.Entities.Trivia.TagQuestionCardOptions

  defp string_compare_map() do
    %{
      "t" => :t,
      "f" => :f,
      "eq" => :eq,
      "neq" => :neq
    }
  end

  def maybe_invert_compare_type(false, cmp_type), do: cmp_type
  def maybe_invert_compare_type(true, cmp_type) do
    case cmp_type do
      :t -> :f
      :f -> :t
      :eq -> :neq
      :neq -> :eq
    end
  end

  def popularity_score(difficulty) do
    dynamic([c], fragment("exp(?)", ^difficulty * c.popularity))
  end

  def maybe_randomize(query, enabled, opts \\ []) do
    case {enabled, Keyword.get(opts, :difficulty)} do
      {false, _} -> query
      {true, lvl} when is_number(lvl) ->
        weights = popularity_score(lvl)
        rand_weighted = dynamic(^weights / fragment("-log(random())"))
        query |> order_by(^rand_weighted)
      _ ->
        query |> order_by(fragment("random()"))
    end
  end
  def randomize(query, opts \\ []), do: maybe_randomize(query, true, opts)

  def hydrate_trivia_def(trivia_def = %TriviaDef{question_source: qsrc, option_source: osrc, }) do
    trivia_def = trivia_def
    |> Repo.preload([:pairing, :question_tag_def, :option_stat_def, :option_tag_def])
    result = case {qsrc, osrc} do
      {"card." <> qcol_name, "card." <> col_name} ->
        %CardQuestionCardOptions{
          question_col_name: column_map()[qcol_name],
          option_col_name: column_map()[col_name]
        }
      {"card." <> qcol_name, "stat"} ->
        %CardQuestionStatOptions{
          question_col_name: column_map()[qcol_name],
          option_stat_def: trivia_def.option_stat_def
        }
      {"card." <> qcol_name, "tag"} ->
        %CardQuestionTagOptions{
          question_col_name: column_map()[qcol_name],
          option_tag_def: trivia_def.option_tag_def
        }
      {"tag", "card." <> col_name} ->
        %TagQuestionCardOptions{
          question_tag_def: trivia_def.question_tag_def,
          option_col_name: column_map()[col_name]
        }
      {"pairing", "card.title"} ->
        %PairingQuestionCardOptions{
          question_pairing: trivia_def.pairing,
          question_subset: trivia_def.question_pairing_subset,
          option_format_separator: trivia_def.option_format_separator,
        }
      {"pairing", "stat"} ->
        %PairingQuestionStatOptions{
          question_pairing: trivia_def.pairing,
          question_subset: trivia_def.question_pairing_subset,
          option_format_separator: trivia_def.option_format_separator,
          option_stat_def: trivia_def.option_stat_def
        }
    end

    Map.merge(result, %{
      deck_id: trivia_def.deck_id,
      question_format: trivia_def.question_format,
      question_difficulty: trivia_def.question_difficulty,
      option_difficulty: trivia_def.option_difficulty,
      compare_type: string_compare_map()[trivia_def.selection_compare_type],
      max_correct_options: trivia_def.selection_max_true,
      max_incorrect_options: trivia_def.selection_length - trivia_def.selection_min_true
    })
  end

  def get_trivia(trivia_def = %TriviaDef{question_format: qf, selection_length: sz}) do
    loadable = hydrate_trivia_def(trivia_def)
    qinst = TriviaLoader.get_question_instance(loadable)
    options = [false, true]
    |> Enum.map(fn sel ->
      {sel,
       TriviaLoader.exec_answer_query(loadable,
        TriviaLoader.get_answer_query(loadable, qinst, not sel))}
    end)
    |> Enum.map(fn {sel, rows} -> Enum.map(rows, &Map.put(&1, :in_selection, sel)) end)
    |> Enum.concat()
    |> Enum.shuffle()
    |> Enum.take(sz)

    options = TriviaLoader.get_extra_info(loadable, options)
    qtext = elem(qinst, 1) || ""
    result = %{
      options: options,
      question: String.replace(qf, "{}", qtext),
    }
    {:ok, trivia_def, result}
  end

  def get_trivia_defs(opts \\ []) do
    {query, cache_key} = case Keyword.get(opts, :not, []) do
      [] -> {from(TriviaDef), "TriviaService.trivia_defs"}
      lst ->
        lst_key = Enum.sort(lst) |> Enum.join(",")
        {from(tdef in TriviaDef, where: not (tdef.answer_type in ^lst)),
         "TriviaService.trivia_defs.not(#{lst_key})"}
    end
    case App.Cache.lookup(cache_key) do
      nil ->
        defs = Repo.all(query)
        App.Cache.insert_with_ttl(cache_key, defs, 60)
        defs
      result -> result
    end
  end

  def get_any_trivia(id_log, opts \\ []) do
    tdef_lst = get_trivia_defs(opts)
    id_to_deck = Map.new(tdef_lst, fn %{id: id, deck_id: deck_id} -> {id, deck_id} end)
    id_from_deck = Enum.map(tdef_lst, &(&1.id))
    |> Enum.group_by(&Map.get(id_to_deck, &1))
    boost_map = Enum.with_index(id_log)
    |> Enum.flat_map(fn {id, turns_since} ->
      # probability for same exact question = x^3; same topic = x^2
      Enum.concat(
        [{id, 0.5 * max(0, 6 - turns_since)}],
        Map.get(id_from_deck, Map.get(id_to_deck, id), []) |> Enum.map(&{&1, max(0, 6 - turns_since)})
      )
    end)
    |> Enum.reduce(%{}, fn {id, amt}, acc ->
      Map.update(acc, id, amt, &(&1 + amt))
    end)
    |> Map.new(fn {id, amt} -> {id, :math.pow(5 / 6.0, amt)} end)

    tdef = Enum.max_by(
      tdef_lst,
      fn %{id: id} -> :math.log(:rand.uniform()) / Map.get(boost_map, id, 1) end,
      fn -> nil end
    )
    case tdef do
      %TriviaDef{} -> get_trivia(tdef)
      _ -> {:error, "No trivia definitions found"}
    end
  end

  defp grade_stat_rank(options_numeric, answer_lst, ascending) do
    answer_order = Enum.with_index(answer_lst) |> Map.new()
    best_order = Enum.with_index(options_numeric)
    |> Enum.sort(fn {av, ai}, {bv, bi} ->
      cond do
        av < bv -> ascending
        av > bv -> not ascending
        true -> Map.get(answer_order, ai) < Map.get(answer_order, bi)
      end
    end)

    best_order
    |> Enum.with_index()
    |> Enum.sort(fn {{_, ai}, _}, {{_, bi}, _} -> ai < bi end)
    |> Enum.map(fn {{_, optidx}, orderidx} -> {Map.get(answer_order, optidx), orderidx} end)
    |> List.foldr({true, []}, fn {ansidx, orderidx}, {full_marks, correct_lst} ->
      opt_feedback = %{order: orderidx}
      cond do
        orderidx < length(answer_lst) or ansidx != nil ->
          mark = if ansidx == orderidx, do: "correct", else: "incorrect"
          {full_marks and ansidx == orderidx, [Map.put(opt_feedback, :mark, mark) | correct_lst]}
        true -> {full_marks, [opt_feedback | correct_lst]}
      end
    end)
  end

  defp get_feedback_one_user(%{answer_type: "selection"}, options, answer_lst) do
    answer_set = MapSet.new(answer_lst)
    Enum.with_index(options)
    |> List.foldr({true, []}, fn {el, idx}, {full_marks, correct_lst} ->
      correct = case {idx in answer_set, Map.get(el, :in_selection)} do
        {_, true} -> %{mark: "correct"}
        {true, false} -> %{mark: "incorrect"}
        {false, false} -> %{}
      end
      no_deduct = (idx in answer_set) == (Map.get(el, :in_selection))
      {no_deduct and full_marks, [correct | correct_lst]}
    end)
  end

  defp get_feedback_one_user(%{answer_type: "stat." <> stat_sel, pairing: pairing, option_stat_def: orig_stat_def},
                             options, answer_lst) do
    stat_def = case pairing do
      %Pairing{} -> Pairing.aggregated_stat_def(pairing, orig_stat_def)
      _ -> orig_stat_def
    end
    parsed = Enum.map(options, fn %{question_value: v} ->
      CardStatDef.parse_stat(stat_def.stat_type, v)
    end)
    with {:ok, option_vals} <- cascade_error(parsed) do
      options_numeric = cond do
        stat_def.stat_type == "date" and stat_def.axis_mod == "age" ->
          Enum.map(option_vals, fn dt -> DateTime.diff(DateTime.utc_now(), dt) end)
        true -> option_vals
      end
      grade_stat_rank(options_numeric, answer_lst, stat_sel in ["asc", "min"])
    else
      _ -> {false, Enum.map(options, fn _ -> nil end)}
    end
  end

  defp get_feedback_match(options, answer_lists) do
    answer_orders = Enum.map(answer_lists, &Map.new(Enum.with_index(&1)))
    Enum.with_index(options)
    |> List.foldr({true, []}, fn {_, idx}, {full_marks, correct_lst} ->
      resp1 = Enum.at(answer_orders, 0) |> Map.fetch(idx)
      no_deduct = Enum.drop(answer_orders, 1)
      |> Enum.map(&(Map.fetch(&1, idx) == resp1))
      |> Enum.all?()
      mark = if no_deduct, do: "correct", else: "incorrect"
      {no_deduct and full_marks, [%{mark: mark} | correct_lst]}
    end)
  end

  def get_feedback(trivia_def, options, user_answers) do
    %{answer_type: atype} = trivia_def
    case atype do
      "matchrank" ->
        common_feedback = get_feedback_match(options, Enum.map(user_answers, &Map.get(&1, "answered")))
        Enum.map(user_answers, fn _ -> common_feedback end)
      _ ->
        Enum.map(user_answers, fn %{"answered" => alst} ->
          get_feedback_one_user(trivia_def, options, alst)
        end)
    end
  end
end
