defmodule App.Entities.TriviaService do

  import Ecto.Query
  import App.Entities.Card, only: [column_map: 0]
  import App.Entities.PairingService
  import App.Utils, only: [cascade_error: 1]

  alias App.Repo
  alias App.Entities.Card
  alias App.Entities.CardStatDef
  alias App.Entities.Pairing
  alias App.Entities.TriviaDef

  defp column_not_null_map() do
    %{
      "title" => dynamic([c], not is_nil(c.title)),
      "popularity" => dynamic([c], not is_nil(c.popularity)),
      "cat1" => dynamic([c], not is_nil(c.cat1)),
      "cat2" => dynamic([c], not is_nil(c.cat2))
    }
  end

  defp string_compare_map() do
    %{
      "t" => :t,
      "f" => :f,
      "eq" => :eq,
      "neq" => :neq
    }
  end

  defp string_inv_compare_map() do
    %{
      "t" => :f,
      "f" => :t,
      "eq" => :neq,
      "neq" => :eq
    }
  end

  defp popularity_score(difficulty) do
    dynamic([c], fragment("exp(?)", ^difficulty * c.popularity))
  end

  defp maybe_randomize(query, enabled, opts \\ []) do
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
  defp randomize(query, opts), do: maybe_randomize(query, true, opts)

  def answer_query(opt_type, opt_info, query_opts \\ [])
  def answer_query(:card_options, {deck_id, col_name}, opts) do
    filter_nulls = column_not_null_map()[col_name]
    query = from c in Card,
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: ^filter_nulls

    query = case Keyword.get(opts, :join) do
      true -> from c in query, join: ct in assoc(c, :tags)
      _ -> query
    end
    randomize_config = Keyword.take(opts, [:difficulty])
    query |> maybe_randomize(length(randomize_config) > 0, randomize_config)
  end

  def answer_query(:stat_options, card_stat_def, opts) do
    query = from c in Card,
      where: c.deck_id == ^card_stat_def.deck_id,
      where: c.is_disabled == false,
      where: c.stat_box[^card_stat_def.key] != fragment("'null'::jsonb")

    query = case Keyword.get(opts, :join) do
      true -> from c in query, join: ct in assoc(c, :tags)
      _ -> query
    end
    randomize_config = Keyword.take(opts, [:difficulty])
    query |> maybe_randomize(length(randomize_config) > 0, randomize_config)
  end

  def answer_query(:tag_options, card_tag_def, _opts) do
    from c in Card,
      join: ct in assoc(c, :tags),
      where: ct.card_tag_def_id == ^card_tag_def.id,
      where: c.is_disabled == false,
      where: not is_nil(ct.value)
  end

  def get_question_instance(:pairing_questions, _trivia_def, _card_tag_def, _opt_type, _opt_info) do
    ""
  end

  def get_question_instance(:tag_questions, trivia_def, card_tag_def, opt_type, opt_info) do
    query = from [c, ct] in answer_query(opt_type, opt_info, join: true),
      select: {ct.id, ct.value},
      where: ct.card_tag_def_id == ^card_tag_def.id,
      limit: 1

    query
    |> randomize(difficulty: trivia_def.question_difficulty)
    |> Repo.one()
  end

  def get_question_instance(:card_questions, trivia_def, {_, col_name}, opt_type, opt_info) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name),
         {:ok, filter_nulls} <- Map.fetch(column_not_null_map(), col_name) do
      query = from [c] in answer_query(opt_type, opt_info),
        select: field(c, ^card_field),
        where: ^filter_nulls,
        limit: 1

      query
      |> randomize(difficulty: trivia_def.question_difficulty)
      |> Repo.one()
    else
      :error -> {:error, "invalid column name for question: #{col_name}"}
    end
  end

  defp groupby_for_col_name(query, "title") do
    query |> group_by([c], [c.title, c.popularity])
  end
  defp groupby_for_col_name(query, col_name) do
    card_field = column_map()[col_name]
    query |> group_by([c], field(c, ^card_field))
  end

  def unique_answer_query(opt_type, opt_info, query_opts \\ [])
  def unique_answer_query(:card_options, {deck_id, col_name}, opts) do
    card_field = column_map()[col_name]
    {order_opts, non_order_opts} = Keyword.split(opts, [:difficulty])
    query = from [c] in answer_query(:card_options, {deck_id, col_name}, non_order_opts),
      select: %{answer: field(c, ^card_field)}

    query
    |> groupby_for_col_name(col_name)
    |> maybe_randomize(Keyword.get(opts, :random_order, true), order_opts)
  end

  def unique_answer_query(:stat_options, card_stat_def, opts) do
    {order_opts, non_order_opts} = Keyword.split(opts, [:difficulty])
    query = from [c] in answer_query(:stat_options, card_stat_def, non_order_opts),
      select: %{answer: c.title, question_value: c.stat_box[^card_stat_def.key]}
    query |> maybe_randomize(Keyword.get(opts, :random_order, true), order_opts)
  end

  def unique_answer_query(:tag_options, card_tag_def, opts) do
    query = from [c, ct] in answer_query(:tag_options, card_tag_def, opts),
      select: %{answer: ct.value},
      group_by: [ct.id, ct.value, ct.card_tag_def_id]
    query |> maybe_randomize(Keyword.get(opts, :random_order, true))
  end

  def filter_answers(query, _, :t, _qtt, _ot, _qv) do
    query
  end

  def filter_answers(query, _, :f, _qtt, _ot, _qv) do
    query |> where([], false)
  end

  def filter_answers(query, :tag_questions, :eq, _card_tag_def, _ot, {tag_id, _}) do
    query |> where([c, ct], ct.id == ^tag_id)
  end

  def filter_answers(query, :tag_questions, :neq, card_tag_def, _ot, {tag_id, _}) do
    query |> where([c, ct], ct.id != ^tag_id and ct.card_tag_def_id == ^card_tag_def.id)
  end

  def filter_answers(query, :card_questions, :eq, {_, col_name}, _ot, question_value) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name) do
      query |> where([c], field(c, ^card_field) == ^question_value)
    end
  end

  # Special case when question_source=col_name, option_source=card_tag_def
  # Need to filter out all rows that would be aggregated into the correct answer.
  def filter_answers(query, :card_questions, :neq, {_, col_name}, :tag_options, question_value) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name) do
      query |> having([c, ct], fragment("BOOL_AND(?)", field(c, ^card_field) != ^question_value))
    end
  end

  def filter_answers(query, :card_questions, :neq, {_, col_name}, _ot, question_value) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name) do
      query |> where([c], field(c, ^card_field) != ^question_value)
    end
  end

  @doc """
  Add an aggregated column to the given query, with the question values
  for which each row would be a correct answer.
  """
  def add_question_value(query, :tag_questions, _card_tag_def) do
    query
    |> select_merge([c, ct], %{question_value: fragment("ARRAY_AGG(?)", ct.value)})
  end

  def add_question_value(query, :card_questions, {_, "title"}) do
    query
    |> select_merge([c], %{question_value: fragment("ARRAY_AGG(?)", c.title)})
  end

  def add_question_value(query, :card_questions, {_, col_name}) do
    card_field = column_map()[col_name]

    query
    |> select_merge([c], %{question_value: fragment("ARRAY_AGG(DISTINCT ?)", field(c, ^card_field))})
  end

  def get_trivia(trivia_def = %TriviaDef{}) do
    # col_name/col_name
    #     Which movie was released in the 1990s?
    #     qcol_name = "cat1"
    #     question_value = "1990s"
    #     acol_name = "title"
    #
    # col_name/card_tag_def
    #     Where was Taxi Driver (1976) set?
    #     qcol_name = "title"
    #     question_value = "Taxi Driver (1976)"
    #     acard_tag_def = %{label: "Setting", ...}
    #
    # card_tag_def/col_name
    #     Which movie did Kathryn Bigelow direct?
    #     qcard_tag_def = %{label: "Director", ...}
    #     question_value = {id, "Kathryn Bigelow"}
    #     acol_name = "title"
    trivia_def = trivia_def
    |> Repo.preload([:pairing, :question_tag_def, :option_stat_def, :option_tag_def])
    %{
      deck_id: deck_id,
      pairing: pairing,
      question_format: question_format,
      question_source: qsource,
      question_tag_def: qcard_tag_def,
      question_pairing_subset: qpairing_subset,
      option_source: osource,
      option_stat_def: ocard_stat_def,
      option_difficulty: option_diff_lvl,
      option_tag_def: ocard_tag_def,
      option_format_separator: option_format_sep,
      selection_length: needs_length,
      selection_min_true: tl_min,
      selection_max_true: tl_max,
      selection_compare_type: cmp_type
    } = Map.merge(%{}, trivia_def)
    fl_max = needs_length - tl_min
    cmp = Map.fetch!(string_compare_map(), cmp_type)
    inv_cmp = Map.fetch!(string_inv_compare_map(), cmp_type)
    {q_type, q_info} = case qsource do
      "tag" -> {:tag_questions, qcard_tag_def}
      "card." <> col_name -> {:card_questions, {deck_id, col_name}}
      "pairing" -> {:pairing_questions, pairing}
    end
    {opt_type, opt_info} = case osource do
      "tag" -> {:tag_options, ocard_tag_def}
      "stat" -> {:stat_options, ocard_stat_def}
      "card." <> col_name -> {:card_options, {deck_id, col_name}}
    end
    odiff_config = case {opt_type, opt_info} do
      {:card_options, {_, "title"}} -> [difficulty: option_diff_lvl]
      {:stat_options, _} -> [difficulty: option_diff_lvl]
      _ -> []
    end

    qinst = get_question_instance(q_type, trivia_def, q_info, opt_type, opt_info)
    {t_rows, f_rows} = cond do
      q_type in [:tag_questions, :card_questions] ->
        template = unique_answer_query(
          opt_type,
          opt_info,
          [join: (q_type == :tag_questions)] ++ odiff_config
        )
        {template
          |> filter_answers(q_type, cmp, q_info, opt_type, qinst)
          |> limit([], ^tl_max)
          |> Repo.all(),
        template
          |> filter_answers(q_type, inv_cmp, q_info, opt_type, qinst)
          |> limit([], ^fl_max)
          |> Repo.all()
        }
      q_type == :pairing_questions ->
        fmt_opts = [title_sep: option_format_sep]
        cmp_opts = %{
          t: [],
          f: [],
          eq: [intersect: qpairing_subset],
          neq: [subtract: qpairing_subset]
        }
        {
          get_pairs(pairing, option_diff_lvl, tl_max, opt_type, opt_info, fmt_opts ++ cmp_opts[cmp]),
          get_pairs(pairing, option_diff_lvl, fl_max, opt_type, opt_info, fmt_opts ++ cmp_opts[inv_cmp]),
        }
    end


    qtext = case qinst do
      {_t_id, q_value} -> q_value
      str -> str
    end

    options = [
      t_rows |> Enum.map(&(Map.put(&1, :in_selection, true))),
      f_rows |> Enum.map(&(Map.put(&1, :in_selection, false)))
    ]
    |> Enum.concat()
    |> Enum.shuffle()
    |> Enum.take(needs_length)

    options = case {q_type, opt_type} do
      {:pairing_questions, _} -> options
      {_, :stat_options} -> options
      _ ->
        back_query = unique_answer_query(opt_type, opt_info,
          join: (q_type == :tag_questions), random_order: false)
        current_answers = options |> Enum.map(&Map.fetch!(&1, :answer))
        filter_current_answers = case {opt_type, opt_info} do
          {:card_options, {_, col_name}} ->
            card_field = column_map()[col_name]
            filt = dynamic([c], field(c, ^card_field) in ^current_answers)
            case {q_type, q_info} do
              {:tag_questions, card_tag_def} ->
                dynamic([c, ct], ^filt and ct.card_tag_def_id == ^card_tag_def.id)
              _ -> filt
            end
          {:tag_options, _} ->
            dynamic([c, ct], ct.value in ^current_answers)
        end
        back_qvals = back_query
        |> where(^filter_current_answers)
        |> add_question_value(q_type, q_info)
        |> Repo.all()
        |> Map.new(fn %{answer: ans, question_value: qval} -> {ans, qval} end)

        options
        |> Enum.map(fn opt = %{answer: ans} ->
          Map.put(opt, :question_value, Map.get(back_qvals, ans, []))
        end)
    end

    result = %{
      options: options,
      question: String.replace(question_format, "{}", qtext),
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
      fn %{id: id} -> :math.log(:random.uniform()) / Map.get(boost_map, id, 1) end,
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
