defmodule App.Entities.TriviaService do

  import Ecto.Query
  import App.Entities.Card, only: [column_map: 0]
  import App.Utils, only: [cascade_error: 1]

  alias App.Repo
  alias App.Entities.Card
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

  def hydrate_trivia_def(trivia_def = %TriviaDef{question_source: qsrc, option_source: osrc}) do
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
      max_incorrect_options: trivia_def.selection_length - trivia_def.selection_min_true,
      answer_type: trivia_def.answer_type
    })
  end

  defp get_options_numeric(loadable = %{option_stat_def: orig_stat_def}, options) do
    stat_def = case Map.get(loadable, :question_pairing) do
      nil -> orig_stat_def
      pairing -> Pairing.aggregated_stat_def(pairing, orig_stat_def)
    end
    parsed = Enum.map(options, fn %{question_value: v} ->
      CardStatDef.parse_stat(stat_def.stat_type, v)
    end)
    with {:ok, option_vals} <- cascade_error(parsed) do
      options_numeric = case {stat_def.stat_type, stat_def.axis_mod} do
        {"date", "age"} -> Enum.map(option_vals, fn dt -> DateTime.diff(DateTime.utc_now(), dt) end)
        _ -> option_vals
      end
      {:ok, options_numeric, stat_def}
    else
      _ -> :error
    end
  end

  def get_trivia(trivia_def = %TriviaDef{question_format: qf, selection_length: sz, answer_type: atyp}) do
    loadable = hydrate_trivia_def(trivia_def)
    qinst = TriviaLoader.get_question_instance(loadable)
    options = [true, false]
    |> Enum.map(fn sel ->
      TriviaLoader.get_answer_query(loadable, qinst, not sel) |>
      (fn query -> TriviaLoader.exec_answer_query(loadable, query) end).()
    end)
    selection_bound = Enum.count(Enum.at(options, 0)) - 1
    options = options
    |> Enum.concat()
    |> Enum.with_index()
    |> Enum.map(fn {o, idx} -> Map.put(o, :id, idx) end)
    |> Enum.shuffle()
    |> Enum.take(sz)
    options = TriviaLoader.get_extra_info(loadable, options)
    qv_type = TriviaLoader.get_question_value_type(loadable)

    {options, prefilled_ans, qv_type} = case atyp do
      "hangman" ->
        correct_str = Map.get(List.first(options), :answer)
        codepoint_pos_map = String.upcase(correct_str)
        |> String.codepoints()
        |> Enum.with_index()
        |> Enum.group_by(&elem(&1, 0), &elem(&1, 1))
        alph_pos_lst = Enum.map(?A..?Z, &List.to_string([&1]))
        |> Enum.map(&{&1, Map.get(codepoint_pos_map, &1, [])})
        nonalph_pos_lst = codepoint_pos_map
        |> Enum.filter(fn {k, _} -> List.first(String.to_charlist(k)) not in ?A..?Z end)
        make_option_map = (fn {k, v}, i ->
          %{answer: k, question_value: v, id: i}
        end)
        {
          alph_pos_lst |> Enum.with_index(make_option_map),
          nonalph_pos_lst |> Enum.with_index(&make_option_map.(&1, 26+&2)),
          "number[]"
        }
      _ ->
        {options, [], qv_type}
    end
    {expected_ans, stats} = case atyp do
      "selection" ->
        {[%{kind: "all", group: Enum.to_list(0..selection_bound)}], nil}
      "matchrank" ->
        {[%{kind: "matchrank"}], nil}
      "hangman" ->
        {fgroup, tgroup} = Enum.concat(options, prefilled_ans)
        |> Enum.split_with(fn %{question_value: qv} -> Enum.empty?(qv) end)
        tgroup = Enum.map(tgroup, &Map.fetch!(&1, :id))
        fgroup = Enum.map(fgroup, &Map.fetch!(&1, :id))
        {[%{kind: "all", group: tgroup}, %{kind: "fewer", group: fgroup, max: 1}], nil}
      "stat." <> order ->
        multi = order in ["asc", "desc"]
        ascending = order in ["asc", "min"]
        {:ok, numeric, agg_stat_def} = get_options_numeric(loadable, options)
        with_numeric = Enum.zip(options, numeric)
        stats_obj = %{
          values: Enum.map(with_numeric, fn {%{id: id}, x} -> [id, x] end),
          definition: Map.take(agg_stat_def,
            [:label, :stat_type, :axis_mod, :axis_min, :axis_max]
          )
        }
        ties = with_numeric
        |> Enum.sort(fn {_, x}, {_, y} -> ascending == (x <= y) end)
        |> Enum.chunk_by(&elem(&1, 1))
        |> Enum.map(fn chunk -> Enum.map(chunk, fn {%{id: id}, _} -> id end) end)
        if multi do
          {graders, _} = Enum.reduce(ties, {[], 0}, fn id_lst, {acc, n} ->
            {
              [%{kind: "all", group: id_lst, min_pos: n} | acc],
              n + Enum.count(id_lst)
            }
          end)
          {graders, stats_obj}
        else
          {[%{kind: "any", group: List.first(ties)}], stats_obj}
        end
    end
    min_answers = case atyp do
      "selection" -> trivia_def.selection_min_true
      "matchrank" -> trivia_def.selection_length
      "hangman" -> 1
      "stat." <> stat_sel ->
        if stat_sel in ["asc", "desc"], do: trivia_def.selection_length, else: 1
    end
    max_answers = case atyp do
      "selection" -> trivia_def.selection_max_true
      "hangman" -> Enum.count(options)
      _ -> min_answers
    end
    qtext = String.replace(qf, "{}", elem(qinst, 1) || "")
    qtext = case elem(qinst, 0) do
      %Card{stat_box: stat_box} ->
        Card.all_stat_keys
        |> Enum.map(fn k -> {Atom.to_string(k), Map.get(stat_box, k)} end)
        |> Enum.filter(fn {_, v} -> not is_nil(v) end)
        |> Enum.reduce(qtext, fn {k, v}, acc -> String.replace(acc, "{#{k}}", v) end)
      _ -> qtext
    end
    prompt = %{
      question: qtext,
      question_value_type: qv_type,
      options: options,
      prefilled_answers: prefilled_ans,
      answer_type: atyp,
      min_answers: min_answers,
      max_answers: max_answers,
      expected_answers: expected_ans,
      stats: stats
    }
    {:ok, trivia_def, prompt}
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

  def grade_answers_single(expected_ans, answer_lst, options) do
    any_checks = Enum.filter(expected_ans, &(Map.get(&1, :kind) == "any"))
    checked1 = Enum.flat_map(any_checks, &(Map.get(&1, :group, []))) |> MapSet.new()
    passed1 = Enum.all?(any_checks, fn %{group: group} ->
      Enum.count(group, &(&1 in answer_lst)) == 1
    end)

    fewer_checks = Enum.filter(expected_ans, &(Map.get(&1, :kind) == "fewer"))
    checked2 = Enum.flat_map(fewer_checks, &(Map.get(&1, :group, []))) |> MapSet.new()
    checked = MapSet.union(checked1, checked2)
    passed2 = Enum.all?(fewer_checks, fn %{group: group, max: v} ->
      Enum.count(answer_lst, &(&1 in group)) <= v
    end)

    passed3 = options
    |> Enum.map(fn %{id: aid} -> aid end)
    |> Enum.filter(&(&1 not in checked))
    |> Enum.all?(fn aid ->
      pos = Enum.find_index(answer_lst, &(&1 == aid)) || -1
      chkr = Enum.find(expected_ans, fn %{kind: kind, group: group} ->
        kind == "all" and (aid in group)
      end)
      {min_pos, max_pos} = case chkr do
        %{min_pos: mp, group: group} ->
          # require ordered selection (range accounts for ties)
          {mp, mp + length(group) - 1}
        %{} ->
          # require option to be selected
          {0, length(options) - 1}
        nil ->
          # require option to not be selected
          {-1, -1}
      end
      min_pos <= pos and pos <= max_pos
    end)

    passed1 and passed2 and passed3
  end

  def grade_answers(trivia, answer_map) do
    %{
      expected_answers: expected_ans,
      options: options
    } = trivia
    for {user_id, ans_lst} <- Map.to_list(answer_map), into: %{} do
      exp_lst = Enum.flat_map(expected_ans, fn
        %{kind: "matchrank"} ->
          case Enum.find(answer_map, fn {uid, _} -> uid != user_id end) do
            {_, ans2} ->
              Enum.with_index(ans2)
              |> Enum.map(fn {aid, idx} -> %{kind: "all", group: [aid], min_pos: idx} end)
            _ -> []
          end
        simple -> [simple]
      end)

      {user_id, grade_answers_single(exp_lst, ans_lst, options)}
    end
  end
end
