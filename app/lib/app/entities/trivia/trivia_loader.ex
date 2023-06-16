alias App.Entities.Trivia.TriviaLoader
alias App.Entities.Trivia.TriviaLoaderDefaults
alias App.Entities.Trivia.CardQuestionCardOptions
alias App.Entities.Trivia.CardQuestionStatOptions
alias App.Entities.Trivia.CardQuestionTagOptions
alias App.Entities.Trivia.PairingQuestionCardOptions
alias App.Entities.Trivia.PairingQuestionStatOptions
alias App.Entities.Trivia.TagQuestionCardOptions

import Ecto.Query
alias App.Repo
alias App.Entities.Card
alias App.Entities.CardTag
alias App.Entities.PairingService
alias App.Entities.TriviaDef
alias App.Entities.TriviaService

defprotocol App.Entities.Trivia.TriviaLoader do
  @type t_question :: {Card.t | CardTag.t | nil, String.t | [String.t] | nil}

  @spec get_question_instance(t) :: t_question
  @doc """
  Randomly select one question row (Card or CardTag), which has an
  association with at least 1 non-null answer row.
  """
  def get_question_instance(trivia)

  @spec get_answer_query(t, t_question, boolean) :: any
  @doc """
  Get the query to select answer rows for the question instance. They will be correct
  if `invert_cmp` is false, and incorrect if it's true.
  """
  def get_answer_query(trivia, question_instance, invert_cmp)

  @spec exec_answer_query(t, any) :: [map]
  @doc """
  Execute the query to select answer rows.
  """
  def exec_answer_query(trivia, query)

  @spec get_extra_info(t, [map]) :: [map]
  @doc """
  Fetch additional information for each answer in the "question_value" field. Example:

      question: "Who directed The Godfather?"
      options: %{"answer" => "Francis Ford Coppola",
                 "in_selection" => true,
                 "question_value" => ["Apocalypse Now", "The Godfather", ...]},
               %{"answer" => "Greta Gerwig",
                 "in_selection" => false,
                 "question_value" => ["Little Women", "Lady Bird", ...]}
  """
  def get_extra_info(trivia, options)

  @spec get_question_value_type(t) :: String.t | nil
  @doc """
  Get the Typescript name of the type get_answer_query and get_extra_info return as a
  :question_value
  """
  def get_question_value_type(trivia)
end

defimpl TriviaLoader, for: CardQuestionCardOptions do
  use TriviaLoaderDefaults

  def get_question_instance(%CardQuestionCardOptions{
    deck_id: deck_id,
    question_col_name: qcol_name,
    option_col_name: col_name,
    option_difficulty: difficulty
  }) do
    query = from c in Card,
      select: {c, field(c, ^qcol_name)},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: not is_nil(field(c, ^qcol_name)),
      where: not is_nil(field(c, ^col_name)),
      limit: 1

    TriviaService.randomize(query, difficulty: difficulty) |> Repo.one()
  end

  def get_answer_query(
    %CardQuestionCardOptions{
      deck_id: deck_id,
      question_col_name: qcol_name,
      option_col_name: col_name,
      option_difficulty: difficulty,
      compare_type: def_cmp_type,
      max_correct_options: tl_max,
      max_incorrect_options: fl_max
    },
    {_, question_value},
    invert_cmp
  ) do
    limit = if invert_cmp, do: fl_max, else: tl_max
    cmp_type = TriviaService.maybe_invert_compare_type(invert_cmp, def_cmp_type)
    query = from c in Card,
      select: %{answer: field(c, ^col_name)},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: not is_nil(field(c, ^col_name)),
      limit: ^limit

    query = case col_name do
      :title -> TriviaService.maybe_randomize(query, cmp_type != :replay, difficulty: difficulty)
      _ -> TriviaService.maybe_randomize(query, cmp_type != :replay) |> group_by([c], field(c, ^col_name))
    end
    case cmp_type do
      :t -> query
      :f -> query |> where([], false)
      :eq -> query |> where([c], field(c, ^qcol_name) == ^question_value)
      :neq -> query |> where([c], field(c, ^qcol_name) != ^question_value)
      :replay -> query |> where([c], field(c, ^col_name) in ^question_value)
    end
  end

  def get_extra_info(
    _trivia,  # = %CardQuestionCardOptions{question_col_name: qcol_name, option_col_name: col_name},
    options
  ) do
    options
    # trivia_rev = Map.merge(trivia, %{
    #   max_correct_options: Enum.count(options),
    #   compare_type: :replay
    # })
    # back_qinst = {nil, Enum.map(options, &Map.get(&1, :answer))}
    # back_query = TriviaLoader.get_answer_query(trivia_rev, back_qinst, false)
    # |> select_merge([c], %{question_value: fragment("ARRAY_AGG(DISTINCT ?)", field(c, ^qcol_name))})

    # back_query = case col_name do
    #   :title -> back_query |> group_by([c], c.title)
    #   _ -> back_query
    # end
    # back_qvals = back_query
    # |> Repo.all()
    # |> Map.new(fn %{answer: ans, question_value: qval} -> {ans, qval} end)

    # Enum.map(options, fn opt = %{answer: ans} ->
    #   Map.put(opt, :question_value, Map.get(back_qvals, ans, []))
    # end)
  end

  def get_question_value_type(_trivia), do: nil
end

defimpl TriviaLoader, for: CardQuestionStatOptions do
  use TriviaLoaderDefaults

  def get_question_instance(%CardQuestionStatOptions{
    deck_id: deck_id,
    question_col_name: qcol_name,
    option_stat_def: stat_def,
    option_difficulty: difficulty
  }) do
    query = from c in Card,
      select: {c, field(c, ^qcol_name)},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: c.stat_box[^stat_def.key] != fragment("'null'::jsonb"),
      where: not is_nil(field(c, ^qcol_name)),
      limit: 1

    TriviaService.randomize(query, difficulty: difficulty) |> Repo.one()
  end

  def get_answer_query(
    %CardQuestionStatOptions{
      deck_id: deck_id,
      question_col_name: qcol_name,
      option_stat_def: stat_def,
      option_difficulty: difficulty,
      compare_type: def_cmp_type,
      max_correct_options: tl_max,
      max_incorrect_options: fl_max,
      answer_type: ans_type,
    },
    {_, question_value},
    invert_cmp
  ) do
    limit = if invert_cmp, do: fl_max, else: tl_max
    cmp_type = TriviaService.maybe_invert_compare_type(invert_cmp, def_cmp_type)
    query = from c in Card,
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: c.stat_box[^stat_def.key] != fragment("'null'::jsonb"),
      limit: ^limit

    query = if ans_type in TriviaDef.stat_answer_types() do
      query |> select([c], %{answer: c.title, question_value: c.stat_box[^stat_def.key]})
    else
      query |> select([c], %{answer: c.stat_box[^stat_def.key], question_value: c.title})
    end

    query = TriviaService.randomize(query, difficulty: difficulty)
    case cmp_type do
      :t -> query
      :f -> query |> where([], false)
      :eq -> query |> where([c], field(c, ^qcol_name) == ^question_value)
      :neq -> query |> where([c], field(c, ^qcol_name) != ^question_value)
    end
  end

  def get_extra_info(_, options), do: options

  def get_question_value_type(_trivia), do: "string"
end

defimpl TriviaLoader, for: CardQuestionTagOptions do
  use TriviaLoaderDefaults

  def get_question_instance(%CardQuestionTagOptions{
    deck_id: deck_id,
    question_col_name: qcol_name,
    option_tag_def: tag_def,
    option_difficulty: difficulty
  }) do
    query = from c in Card,
      join: ct in assoc(c, :tags),
      select: {c, field(c, ^qcol_name)},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: ct.card_tag_def_id == ^tag_def.id,
      where: not is_nil(field(c, ^qcol_name)),
      where: not is_nil(ct.value),
      limit: 1

    TriviaService.randomize(query, difficulty: difficulty) |> Repo.one()
  end

  def get_answer_query(
    %CardQuestionTagOptions{
      deck_id: deck_id,
      question_col_name: qcol_name,
      option_tag_def: tag_def,
      compare_type: def_cmp_type,
      max_correct_options: tl_max,
      max_incorrect_options: fl_max
    },
    {_, question_value},
    invert_cmp
  ) do
    limit = if invert_cmp, do: fl_max, else: tl_max
    cmp_type = TriviaService.maybe_invert_compare_type(invert_cmp, def_cmp_type)
    query = from c in Card,
      join: ct in assoc(c, :tags),
      select: %{answer: ct.value},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: ct.card_tag_def_id == ^tag_def.id,
      where: not is_nil(ct.value),
      group_by: [ct.id, ct.value, ct.card_tag_def_id],
      limit: ^limit

    query = TriviaService.maybe_randomize(query, cmp_type != :replay)
    case cmp_type do
      :t -> query
      :f -> query |> where([], false)
      :eq -> query |> where([c], field(c, ^qcol_name) == ^question_value)
      :neq -> query |> having([c], fragment("BOOL_AND(?)", field(c, ^qcol_name) != ^question_value))
      :replay -> query |> where([c, ct], ct.value in ^question_value)
    end
  end

  def get_extra_info(trivia = %CardQuestionTagOptions{question_col_name: qcol_name}, options) do
    trivia_rev = Map.merge(trivia, %{
      max_correct_options: Enum.count(options),
      compare_type: :replay
    })

    back_qinst = {nil, Enum.map(options, &Map.get(&1, :answer))}
    back_qvals = TriviaLoader.get_answer_query(trivia_rev, back_qinst, false)
    |> select_merge([c], %{question_value: fragment("ARRAY_AGG(DISTINCT ?)", field(c, ^qcol_name))})
    |> Repo.all()
    |> Map.new(fn %{answer: ans, question_value: qval} -> {ans, qval} end)

    Enum.map(options, fn opt = %{answer: ans} ->
      Map.merge(opt, %{question_value: Map.get(back_qvals, ans, [])})
    end)
  end

  def get_question_value_type(_trivia), do: "string[]"
end

defimpl TriviaLoader, for: TagQuestionCardOptions do
  use TriviaLoaderDefaults

  def get_question_instance(%TagQuestionCardOptions{
    deck_id: deck_id,
    question_tag_def: qtag_def,
    option_col_name: col_name,
    option_difficulty: difficulty
  }) do
    query = from c in Card,
      join: ct in assoc(c, :tags),
      select: {ct, ct.value},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: not is_nil(field(c, ^col_name)),
      where: ct.card_tag_def_id == ^qtag_def.id,
      limit: 1

    TriviaService.randomize(query, difficulty: difficulty) |> Repo.one()
  end

  def get_answer_query(
    %TagQuestionCardOptions{
      deck_id: deck_id,
      question_tag_def: qtag_def,
      option_col_name: col_name,
      option_difficulty: difficulty,
      compare_type: def_cmp_type,
      max_correct_options: tl_max,
      max_incorrect_options: fl_max
    },
    {ct, question_value},
    invert_cmp
  ) do
    tag_id = if is_map(ct), do: ct.id, else: nil
    limit = if invert_cmp, do: fl_max, else: tl_max
    cmp_type = TriviaService.maybe_invert_compare_type(invert_cmp, def_cmp_type)
    query = from c in Card,
      join: ct in assoc(c, :tags),
      select: %{answer: field(c, ^col_name)},
      where: c.deck_id == ^deck_id,
      where: c.is_disabled == false,
      where: not is_nil(field(c, ^col_name)),
      where: ct.card_tag_def_id == ^qtag_def.id,
      limit: ^limit

    query = case col_name do
      :title ->
        query
        |> group_by([c], [c.title, c.popularity])
        |> TriviaService.maybe_randomize(cmp_type != :replay, difficulty: difficulty)
      _ -> TriviaService.maybe_randomize(query, cmp_type != :replay) |> group_by([c], field(c, ^col_name))
    end
    case cmp_type do
      :t -> query
      :f -> query |> where([], false)
      :eq -> query |> where([c, ct], ct.id == ^tag_id)
      :neq -> query |> having([c, ct], fragment("BOOL_AND(?)", ct.id != ^tag_id))
      :replay -> query |> where([c], field(c, ^col_name) in ^question_value)
    end
  end

  def get_extra_info(trivia = %TagQuestionCardOptions{}, options) do
    trivia_rev = Map.merge(trivia, %{
      max_correct_options: Enum.count(options),
      compare_type: :replay
    })

    back_qinst = {nil, Enum.map(options, &Map.get(&1, :answer))}
    back_qvals = TriviaLoader.get_answer_query(trivia_rev, back_qinst, false)
    |> select_merge([c, ct], %{question_value: fragment("ARRAY_AGG(?)", ct.value)})
    |> Repo.all()
    |> Map.new(fn %{answer: ans, question_value: qval} -> {ans, qval} end)

    Enum.map(options, fn opt = %{answer: ans} ->
      Map.merge(opt, %{question_value: Map.get(back_qvals, ans, [])})
    end)
  end

  def get_question_value_type(_trivia), do: "string[]"
end

defimpl TriviaLoader, for: PairingQuestionCardOptions do
  def get_question_instance(_) do
    {nil, nil}
  end

  def get_answer_query(
    %PairingQuestionCardOptions{
      question_pairing: pairing,
      question_subset: subset,
      option_difficulty: difficulty,
      option_format_separator: title_sep,
      compare_type: def_cmp_type,
      max_correct_options: tl_max,
      max_incorrect_options: fl_max
    },
    _,
    invert_cmp
  ) do
    limit = if invert_cmp, do: fl_max, else: tl_max
    cmp_type = TriviaService.maybe_invert_compare_type(invert_cmp, def_cmp_type)
    subset_tuple = case cmp_type do
      :eq -> {:intersect, subset}
      :neq -> {:subtract, subset}
      _ -> nil
    end
    pairing = pairing
    |> Repo.preload([deck: [:card_stat_defs]])
    {pairing, difficulty, limit, title_sep || " + ", subset_tuple}
  end

  def exec_answer_query(
    %PairingQuestionCardOptions{},
    {pairing, difficulty, limit, title_sep, subset_tuple}
  ) do
    %{"agg" => aggs} = pairing.criteria
    with :ok <- PairingService.validate_aggs(pairing.deck, aggs |> Map.to_list()) do
      result = PairingService.sample_pairs(pairing, difficulty, limit, subset_tuple)

      Enum.map(result, fn {c1, c2, extra} ->
        %{
          answer: Enum.join([c1.title, c2.title], title_sep),
          question_value: extra
        }
      end)
    end
  end

  def get_extra_info(_, options), do: options

  def get_question_value_type(_trivia), do: "string"
end

defimpl TriviaLoader, for: PairingQuestionStatOptions do
  def get_question_instance(_) do
    {nil, nil}
  end

  def get_answer_query(trivia_def, qinst, invert_cmp) do
    common_keys = [
      :deck_id,
      :question_format,
      :question_difficulty,
      :option_difficulty,
      :compare_type,
      :max_correct_options,
      :max_incorrect_options,
      :question_subset,
      :question_pairing,
      :option_format_separator
    ]
    Map.merge(%PairingQuestionCardOptions{}, Map.take(trivia_def, common_keys))
    |> TriviaLoader.get_answer_query(qinst, invert_cmp)
  end

  def exec_answer_query(
    %PairingQuestionStatOptions{option_stat_def: stat_def},
    {pairing, difficulty, limit, title_sep, subset_tuple}
  ) do
    %{"agg" => aggs} = pairing.criteria
    with :ok <- PairingService.validate_aggs(pairing.deck, aggs |> Map.to_list()) do
      result = PairingService.sample_pairs(pairing, difficulty, limit, subset_tuple)

      Enum.map(result, fn {c1, c2, _} ->
        sa = String.to_atom(stat_def.key)
        {_, funcname} = Enum.find(aggs, &(elem(&1, 0) == stat_def.key))
        v1 = Map.get(c1.stat_box, sa)
        v2 = Map.get(c2.stat_box, sa)
        %{
          answer: Enum.join([c1.title, c2.title], title_sep),
          question_value: to_string(PairingService.calc_agg(stat_def, funcname, v1, v2))
        }
      end)
    end
  end

  def get_extra_info(_, options), do: options

  def get_question_value_type(_trivia), do: "string"
end
