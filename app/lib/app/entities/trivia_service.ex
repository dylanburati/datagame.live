defmodule App.Entities.TriviaService do

  import Ecto.Query

  alias App.Repo
  alias App.Entities.Card
  alias App.Entities.TriviaDef

  defp column_map() do
    %{
      "title" => :title,
      "popularity" => :popularity,
      "tag1" => :tag1
    }
  end

  defp column_not_null_map() do
    %{
      "title" => dynamic([c], not is_nil(c.title)),
      "popularity" => dynamic([c], not is_nil(c.popularity)),
      "tag1" => dynamic([c], not is_nil(c.tag1))
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

  def answer_query(opt_type, opt_info, query_opts \\ [])
  def answer_query(:col_name, {deck_id, col_name}, opts) do
    filter_nulls = column_not_null_map()[col_name]
    query = from c in Card,
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: ^filter_nulls

    case Keyword.get(opts, :join) do
      true -> from c in query, join: ct in assoc(c, :tags)
      _ -> query
    end
  end

  def answer_query(:card_stat_def, card_stat_def, opts) do
    query = from c in Card,
      where: c.deck_id == ^card_stat_def.deck_id,
      where: c.is_disabled == false,
      where: c.stat_box[^card_stat_def.key] != fragment("'null'::jsonb")

    case Keyword.get(opts, :join) do
      true -> from c in query, join: ct in assoc(c, :tags)
      _ -> query
    end
  end

  def answer_query(:card_tag_def, card_tag_def, _opts) do
    from c in Card,
      join: ct in assoc(c, :tags), as: :tag,
      where: ct.card_tag_def_id == ^card_tag_def.id,
      where: c.is_disabled == false,
      where: not is_nil(ct.value)
  end

  def get_question_instance(:card_tag_def, card_tag_def, opt_type, opt_info) do
    query = from [c, ct] in answer_query(opt_type, opt_info, join: true),
      order_by: fragment("random()"),
      select: {ct.id, ct.value},
      where: ct.card_tag_def_id == ^card_tag_def.id,
      limit: 1

    query |> Repo.one()
  end

  def get_question_instance(:card_stat_def, _card_stat_def, _opt_type, _opt_info) do
    raise "Can't create a question from a statistic"
  end

  def get_question_instance(:col_name, {_, col_name}, opt_type, opt_info) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name),
         {:ok, filter_nulls} <- Map.fetch(column_not_null_map(), col_name) do
      query = from [c] in answer_query(opt_type, opt_info),
        order_by: fragment("random()"),
        select: field(c, ^card_field),
        where: ^filter_nulls,
        limit: 1

      query |> Repo.one()
    else
      :error -> {:error, "invalid column name for question: #{col_name}"}
    end
  end

  defp maybe_randomize(query, enabled) do
    case enabled do
      true -> query |> order_by(fragment("random()"))
      false -> query
    end
  end

  def unique_answer_query(opt_type, opt_info, query_opts \\ [])
  def unique_answer_query(:col_name, {deck_id, col_name}, opts) do
    card_field = column_map()[col_name]
    query = from [c] in answer_query(:col_name, {deck_id, col_name}, opts),
      select: %{answer: field(c, ^card_field)},
      group_by: field(c, ^card_field)
    query |> maybe_randomize(Keyword.get(opts, :random_order, true))
  end

  def unique_answer_query(:card_stat_def, card_stat_def, opts) do
    query = from [c] in answer_query(:card_stat_def, card_stat_def, opts),
      select: %{answer: c.title, question_value: c.stat_box[^card_stat_def.key]}
    query |> maybe_randomize(Keyword.get(opts, :random_order, true))
  end

  def unique_answer_query(:card_tag_def, card_tag_def, opts) do
    query = from [c, ct] in answer_query(:card_tag_def, card_tag_def, opts),
      select: %{answer: ct.value},
      group_by: [ct.id, ct.value, ct.card_tag_def_id]
    query |> maybe_randomize(Keyword.get(opts, :random_order, true))
  end

  def filter_answers(_, :t, _3, _4) do
    dynamic([], true)
  end

  def filter_answers(_, :f, _3, _4) do
    dynamic([], false)
  end

  def filter_answers(:card_tag_def, :eq, _card_tag_def, {tag_id, _}) do
    dynamic([c, ct], ct.id == ^tag_id)
  end

  def filter_answers(:card_tag_def, :neq, card_tag_def, {tag_id, _}) do
    dynamic([c, ct], ct.id != ^tag_id and ct.card_tag_def_id == ^card_tag_def.id)
  end

  def filter_answers(:col_name, :eq, {_, col_name}, question_value) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name) do
      dynamic([c], field(c, ^card_field) == ^question_value)
    end
  end

  def filter_answers(:col_name, :neq, {_, col_name}, question_value) do
    with {:ok, card_field} <- Map.fetch(column_map(), col_name) do
      dynamic([c], field(c, ^card_field) != ^question_value)
    end
  end

  def add_question_value(query, :card_tag_def, _card_tag_def) do
    # reverse to find question values for which this would be an answer
    query
    |> select_merge([c, ct], %{question_value: fragment("ARRAY_AGG(?)", ct.value)})
  end

  def add_question_value(query, :col_name, {_, "title"}) do
    # reverse to find question values for which this would be an answer
    query
    |> select_merge([c], %{question_value: fragment("ARRAY_AGG(?)", c.title)})
  end

  def add_question_value(query, :col_name, {_, "tag1"}) do
    # reverse to find question values for which this would be an answer
    query
    |> select_merge([c], %{question_value: fragment("ARRAY_AGG(DISTINCT ?)", c.tag1)})
  end

  def get_trivia(trivia_def = %TriviaDef{}) do
    # col_name/col_name
    #     Which movie was released in the 1990s?
    #     qcol_name = "tag1"
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
    |> Repo.preload([:question_tag_def, :option_stat_def, :option_tag_def])
    %{
      deck_id: deck_id,
      question_format: question_format,
      question_source: qsource,
      question_tag_def: qcard_tag_def,
      option_source: osource,
      option_stat_def: ocard_stat_def,
      option_tag_def: ocard_tag_def,
      selection_length: needs_length,
      selection_min_true: tl_min,
      selection_max_true: tl_max,
      selection_compare_type: cmp_type
    } = Map.merge(%{}, trivia_def)
    fl_max = needs_length - tl_min
    cmp = Map.fetch!(string_compare_map(), cmp_type)
    inv_cmp = Map.fetch!(string_inv_compare_map(), cmp_type)
    {q_type, q_info} = case qsource do
      "tag" -> {:card_tag_def, qcard_tag_def}
      "card." <> col_name -> {:col_name, {deck_id, col_name}}
    end
    {opt_type, opt_info} = case osource do
      "tag" -> {:card_tag_def, ocard_tag_def}
      "stat" -> {:card_stat_def, ocard_stat_def}
      "card." <> col_name -> {:col_name, {deck_id, col_name}}
    end

    qinst = get_question_instance(q_type, q_info, opt_type, opt_info)
    template = unique_answer_query(opt_type, opt_info, join: (q_type == :card_tag_def))
    t_query = template
    |> where(^filter_answers(q_type, cmp, q_info, qinst))
    |> limit([], ^tl_max)
    f_query = template
    |> where(^filter_answers(q_type, inv_cmp, q_info, qinst))
    |> limit([], ^fl_max)

    qtext = case qinst do
      {_t_id, q_value} -> q_value
      str -> str
    end

    options = [
      t_query |> Repo.all() |> Enum.map(&(Map.put(&1, :in_selection, true))),
      f_query |> Repo.all() |> Enum.map(&(Map.put(&1, :in_selection, false)))
    ]
    |> Enum.concat()
    |> Enum.shuffle()
    |> Enum.take(needs_length)

    options = case opt_type do
      :card_stat_def -> options
      _ ->
        back_query = unique_answer_query(opt_type, opt_info,
          join: (q_type == :card_tag_def), random_order: false)
        current_answers = options |> Enum.map(&Map.fetch!(&1, :answer))
        filter_current_answers = case {opt_type, opt_info} do
          {:col_name, {_, col_name}} ->
            card_field = column_map()[col_name]
            filt = dynamic([c], field(c, ^card_field) in ^current_answers)
            case {q_type, q_info} do
              {:card_tag_def, card_tag_def} ->
                dynamic([c, ct], ^filt and ct.card_tag_def_id == ^card_tag_def.id)
              _ -> filt
            end
          {:card_tag_def, _} ->
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

  def get_any_trivia() do
    case tdef = Repo.one(from(TriviaDef, order_by: fragment("random()"), limit: 1)) do
      %TriviaDef{} -> get_trivia(tdef)
      _ -> {:error, "No trivia definitions found"}
    end
  end
end
