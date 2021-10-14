defmodule App.Entities.TriviaService do

  import Ecto.Query
  import App.Utils

  alias App.Repo
  alias App.Entities.Card
  alias App.Entities.CardTag
  alias App.Entities.CardTagDef
  alias App.Entities.TriviaDef

  defp column_map() do
    %{
      "title" => :title,
      "popularity" => :popularity,
      "tag1" => :tag1
    }
  end

  defp groupby_map() do
    %{
      "title" => dynamic([c], c.title),
      "tag1" => dynamic([c], c.tag1)
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

  def answer_query(:col_name, {deck_id, "title"}) do
    from c in Card,
      left_join: ct in assoc(c, :tags),
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: not is_nil(c.title)
  end

  def answer_query(:col_name, {deck_id, "tag1"}) do
    from c in Card,
      left_join: ct in assoc(c, :tags),
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: not is_nil(c.tag1)
  end

  def answer_query(:card_tag_def, card_tag_def) do
    IO.puts card_tag_def.label
    from c in Card,
      left_join: ct in assoc(c, :tags),
      where: ct.card_tag_def_id == ^card_tag_def.id,
      where: c.is_disabled == false,
      where: not is_nil(ct.value)
  end

  def get_question_instance(:card_tag_def, card_tag_def, opt_type, opt_info) do
    query = from [c, ct] in answer_query(opt_type, opt_info),
      order_by: fragment("random()"),
      select: {ct.id, ct.value},
      where: ct.card_tag_def_id == ^card_tag_def.id,
      limit: 1

    query |> Repo.one()
  end

  def get_question_instance(:col_name, {_, col_name}, opt_type, opt_info) do
    with {:ok, field} <- Map.fetch(column_map(), col_name) do
      query = from [c, ct] in answer_query(opt_type, opt_info),
        order_by: fragment("random()"),
        select: c,
        limit: 1

      query |> Repo.one() |> Map.get(field)
    else
      :error -> {:error, "invalid column name for question: #{col_name}"}
    end
  end

  def unique_answer_query(:col_name, {deck_id, "title"}) do
    from [c, ct] in answer_query(:col_name, {deck_id, "title"}),
      select: %{answer: c.title},
      select_merge: %{popularity: c.popularity},
      group_by: [c.title, c.popularity],
      order_by: fragment("random()")
  end

  def unique_answer_query(:col_name, {deck_id, "tag1"}) do
    from [c, ct] in answer_query(:col_name, {deck_id, "tag1"}),
      select: %{answer: c.title},
      group_by: [c.tag1],
      order_by: fragment("random()")
  end

  def unique_answer_query(:card_tag_def, card_tag_def) do
    from [c, ct] in answer_query(:card_tag_def, card_tag_def),
      select: %{answer: ct.value},
      group_by: [ct.id, ct.value, ct.card_tag_def_id],
      order_by: fragment("random()")
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

  def filter_answers(:col_name, :eq, "title", question_value) do
    dynamic([c], c.title == ^question_value)
  end

  def filter_answers(:col_name, :neq, "title", question_value) do
    dynamic([c], c.title != ^question_value)
  end

  def filter_answers(:col_name, :eq, "tag1", question_value) do
    dynamic([c], c.tag1 == ^question_value)
  end

  def filter_answers(:col_name, :neq, "tag1", question_value) do
    dynamic([c], c.tag1 != ^question_value)
  end

  def add_question_value(query, :card_tag_def, _card_tag_def) do
    # reverse to find question values for which this would be an answer
    query
    |> select_merge([c, ct], %{question_value: fragment("ARRAY_AGG(?)", ct.value)})
  end

  def add_question_value(query, :col_name, "title") do
    # reverse to find question values for which this would be an answer
    query
    |> select_merge([c], %{question_value: fragment("ARRAY_AGG(?)", c.title)})
  end

  def add_question_value(query, :col_name, "tag1") do
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
    trivia_def = trivia_def |> Repo.preload([:question_tag_def, :option_tag_def])
    %{
      deck_id: deck_id,
      question_format: question_format,
      question_column_name: qcol_name,
      question_tag_def: qcard_tag_def,
      option_column_name: ocol_name,
      option_tag_def: ocard_tag_def,
      selection_length: needs_length,
      selection_min_true: tl_min,
      selection_max_true: tl_max,
      selection_compare_type: cmp_type,
      answer_type: ans_type
    } = trivia_def
    fl_max = needs_length - tl_min
    cmp = Map.fetch!(string_compare_map(), cmp_type)
    inv_cmp = Map.fetch!(string_inv_compare_map(), cmp_type)
    {q_type, q_info} = case qcard_tag_def do
      %CardTagDef{} -> {:card_tag_def, qcard_tag_def}
      _ -> {:col_name, {deck_id, qcol_name}}
    end
    {opt_type, opt_info} = case ocard_tag_def do
      %CardTagDef{} -> {:card_tag_def, ocard_tag_def}
      _ -> {:col_name, {deck_id, ocol_name}}
    end

    qinst = get_question_instance(q_type, q_info, opt_type, opt_info)
    template = unique_answer_query(opt_type, opt_info)
    {qtext, t_query, f_query} = case q_type do
      :card_tag_def ->
        {t_id, q_value} = qinst
        {
          q_value,
          template
            |> where(^filter_answers(:card_tag_def, cmp, qcard_tag_def, {t_id, q_value}))
            |> limit([], ^tl_max)
            |> add_question_value(:card_tag_def, qcard_tag_def),
          template
            |> where(^filter_answers(:card_tag_def, inv_cmp, qcard_tag_def, {t_id, q_value}))
            |> limit([], ^fl_max)
            |> add_question_value(:card_tag_def, qcard_tag_def)
        }
      _ ->
        {
          qinst,
          template
            |> where(^filter_answers(:col_name, cmp, qcol_name, qinst))
            |> limit([], ^tl_max)
            |> add_question_value(:col_name, qcol_name),
          template
            |> where(^filter_answers(:col_name, inv_cmp, qcol_name, qinst))
            |> limit([], ^fl_max)
            |> add_question_value(:col_name, qcol_name)
        }
    end

    options = [
      t_query |> Repo.all() |> Enum.map(&(Map.put(&1, :in_selection, true))),
      f_query |> Repo.all() |> Enum.map(&(Map.put(&1, :in_selection, false)))
    ]
    |> Enum.concat()
    |> Enum.shuffle()
    |> Enum.take(needs_length)

    %{
      options: options,
      question: String.replace(question_format, "{}", qtext),
      answer_type: ans_type,
    }
  end
end
