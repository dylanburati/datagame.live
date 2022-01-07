defmodule App.Entities.PairingService do
  import Ecto.Query
  # import App.Utils
  import App.Entities.Card, only: [column_map: 0]

  alias App.Repo
  alias App.Entities.Card
  # alias App.Entities.CardStatDef
  alias App.Entities.Deck
  # alias App.Entities.Pairing
  alias App.Entities.PairingInstance

  defp validate_aggs(_deck, []), do: :ok
  defp validate_aggs(deck, [{stat_key, funcname} | rest]) do
    case validate_aggs(deck, rest) do
      :ok ->
        case Enum.find(deck.card_stat_defs, &(&1.key == stat_key)) do
          nil -> {:error, "Invalid aggregate source: #{stat_key}"}
          def ->
            case {def.stat_type, funcname} do
              {"lat_lon", "geodist"} -> :ok
              _ -> {:error, "Invalid aggregation for type #{def.stat_type}: #{funcname}"}
            end
        end
      err -> err
    end
  end

  defp parse_float!(str) do
    {num, _} = Float.parse(str)
    num
  end

  defp haversin(num) do
    x = :math.sin(num / 2.0)
    x * x
  end

  defp sin2(num) do
    x = :math.sin(num)
    x * x
  end

  defp cos2(num) do
    x = :math.cos(num)
    x * x
  end

  def calc_agg(_stat_def, "geodist", v1, v2) do
    [lat1, lon1] = String.split(v1, ",")
    |> Enum.map(&(parse_float!(&1) * :math.pi / 180.0))
    [lat2, lon2] = String.split(v2, ",")
    |> Enum.map(&(parse_float!(&1) * :math.pi / 180.0))

    flattening = 1.0 / 298.257223563
    radius_km = 6371.009

    # lambert's formula
    b1 = :math.atan((1.0 - flattening) * :math.tan(lat1))
    b2 = :math.atan((1.0 - flattening) * :math.tan(lat2))
    dlambda = abs(lon1 - lon2)
    dphi = abs(b1 - b2)
    central2 = haversin(dphi) + haversin(dlambda) * (1.0 - haversin(dphi) - haversin(lat1 + lat2))
    halfcentral = :math.asin(:math.sqrt(central2))
    central = 2 * halfcentral
    p = 0.5 * (b1 + b2)
    q = 0.5 * (b2 - b1)
    x = (central - :math.sin(central)) * sin2(p) * cos2(q) / cos2(halfcentral)
    y = (central + :math.sin(central)) * sin2(q) * cos2(p) / sin2(halfcentral)
    radius_km * (central - 0.5 * flattening * (x + y))
  end

  def get_pairs(pairing, difficulty, limit, ans_type, ans_info, opts \\ []) do
    %{"agg" => aggs} = pairing.criteria

    deck = Repo.get!(Deck, pairing.deck_id)
    |> Repo.preload([:card_stat_defs])

    with :ok <- validate_aggs(deck, aggs |> Map.to_list()) do
      result = case Keyword.get(opts, :intersect) do
        nil ->
          generate_pairs(deck, pairing, difficulty, limit, Keyword.get(opts, :subtract))
        subset ->
          query = from p in PairingInstance,
            join: c1 in assoc(p, :card1),
            join: c2 in assoc(p, :card2),
            select: {c1, c2, p},
            where: p.pairing_id == ^pairing.id,
            where: p.subset == ^subset,
            where: c1.is_disabled == false,
            where: c2.is_disabled == false,
            order_by: fragment("exp(?) / -log(random())", ^difficulty * c1.popularity * c2.popularity),
            limit: ^limit
          query |> Repo.all()
      end
      title_sep = Keyword.get(opts, :title_sep) || " + "

      result
      |> Enum.map(fn {c1, c2, p} ->
        case {ans_type, ans_info} do
          {:card_options, {_, "title"}} ->
            %{
              answer: Enum.join([c1.title, c2.title], title_sep),
              question_value: Map.get(p, :info)
            }
          {:stat_options, card_stat_def} ->
            sa = String.to_atom(card_stat_def.key)
            {_, funcname} = Enum.find(aggs, fn {k, _} -> k == card_stat_def.key end)
            v1 = Map.get(c1.stat_box, sa)
            v2 = Map.get(c2.stat_box, sa)
            %{
              answer: Enum.join([c1.title, c2.title], title_sep),
              question_value: to_string(calc_agg(card_stat_def, funcname, v1, v2))
            }
        end
      end)
    end
  end

  def generate_pairs(deck, pairing, difficulty, limit, subtract_subset) do
    %{"filter" => cond_lst} = pairing.criteria

    {indep_conds, join_conds} = Enum.reduce(
      cond_lst,
      {dynamic([], true), dynamic([], true)},
      fn cnd, {ic, jc} ->
        case cnd do
          ["exists", stat_key = ("stat" <> _)] ->
            # stat_key = Card.key_for_stat(which_stat)
            ic = dynamic([c], ^ic and c.stat_box[^stat_key] != fragment("'null'::jsonb"))
            {ic, jc}
          ["mismatch", col_name] ->
            jc = case Map.fetch(column_map(), col_name) do
              {:ok, card_field} ->
                dynamic([c2, c1], ^jc and field(c1, ^card_field) != field(c2, ^card_field))
              _ ->
                dynamic([c2, c1], ^jc and
                  fragment("jsonb_extract_path_text(?, ?)", c1.stat_box, ^col_name) !=
                    fragment("jsonb_extract_path_text(?, ?)", c2.stat_box, ^col_name))
            end
            {ic, jc}
          ["match", left_col, right_col] ->
            jc = case {Map.fetch(column_map(), left_col), Map.fetch(column_map(), right_col)} do
              {{:ok, left_field}, {:ok, right_field}} ->
                dynamic([c2, c1], ^jc and field(c1, ^left_field) == field(c2, ^right_field)
                  and field(c2, ^left_field) == field(c1, ^right_field))
              {{:ok, left_field}, _} ->
                dynamic([c2, c1], ^jc and field(c1, ^left_field) == fragment("jsonb_extract_path_text(?, ?)", c2.stat_box, ^right_col)
                  and field(c2, ^left_field) == fragment("jsonb_extract_path_text(?, ?)", c1.stat_box, ^right_col))
              {_, {:ok, right_field}} ->
                dynamic([c2, c1], ^jc and fragment("jsonb_extract_path_text(?, ?)", c1.stat_box, ^left_col) == field(c2, ^right_field)
                  and fragment("jsonb_extract_path_text(?, ?)", c2.stat_box, ^left_col) == field(c1, ^right_field))
              {_, _} ->
                dynamic([c2, c1], ^jc and
                  fragment("jsonb_extract_path_text(?, ?)", c1.stat_box, ^left_col) ==
                    fragment("jsonb_extract_path_text(?, ?)", c2.stat_box, ^right_col)
                  and fragment("jsonb_extract_path_text(?, ?)", c2.stat_box, ^left_col) ==
                    fragment("jsonb_extract_path_text(?, ?)", c1.stat_box, ^right_col))
            end
            {ic, jc}
        end
      end
    )

    stage1_limit = min(20, floor(deck.enabled_count / 10))
    stage1_query = from c1 in Card,
      where: c1.deck_id == ^deck.id,
      where: c1.is_disabled == false,
      where: ^indep_conds,
      order_by: fragment("exp(?) / -log(random())", ^difficulty * c1.popularity),
      limit: ^stage1_limit

    query = from c2 in Card,
      as: :card2,
      cross_join: c1 in subquery(stage1_query), as: :card1,
      select: {c1, c2, %{}},
      where: c2.deck_id == ^deck.id,
      where: c2.is_disabled == false,
      where: ^indep_conds,
      where: ^join_conds,
      order_by: fragment("exp(?) / -log(random())", ^difficulty * c1.popularity * c2.popularity),
      limit: ^limit

    query = case subtract_subset do
      nil -> query
      subset ->
        query
        |> where(not exists(
          from(p in PairingInstance,
               where: p.id == ^pairing.id,
               where: p.subset == ^subset,
               where: (parent_as(:card1).id == p.card_id1 and parent_as(:card2).id == p.card_id2)
                   or (parent_as(:card1).id == p.card_id2 and parent_as(:card2).id == p.card_id1)
          )
        ))
    end

    query |> Repo.all()
  end

  def generate_all_pairs(pairing) do
    %{"filter" => cond_lst} = pairing.criteria

    indep_conds = Enum.reduce(
      cond_lst,
      dynamic([], true),
      fn cnd, ic ->
        case cnd do
          ["exists", stat_key = ("stat" <> _)] ->
            # stat_key = Card.key_for_stat(which_stat)
            dynamic([c], ^ic and c.stat_box[^stat_key] != fragment("'null'::jsonb"))
          _ -> ic
        end
      end
    )

    stage1_query = from c1 in Card,
      where: c1.deck_id == ^pairing.deck_id,
      where: c1.is_disabled == false,
      where: ^indep_conds

    candidates = stage1_query |> Repo.all()
    candidates
    |> Enum.map(fn c1 ->
      in_filter = Enum.map(candidates, fn c2 ->
        Enum.reduce(
          cond_lst,
          true,
          fn cnd, within_filter ->
            case {cnd, within_filter} do
              {_, false} -> false
              {["mismatch", col_name], _} ->
                case Map.fetch(column_map(), col_name) do
                  {:ok, card_field} -> Map.fetch!(c1, card_field) != Map.fetch!(c2, card_field)
                  _ ->
                    sa = String.to_atom(col_name)
                    Map.fetch!(c1.stat_box, sa) != Map.fetch!(c2.stat_box, sa)
                end

              {["match", left_col, right_col], _} ->
                {lv1, lv2} = case Map.fetch(column_map(), left_col) do
                  {:ok, card_field} -> {Map.fetch!(c1, card_field), Map.fetch!(c2, card_field)}
                  _ ->
                    sa = String.to_atom(left_col)
                    {Map.fetch!(c1.stat_box, sa), Map.fetch!(c2.stat_box, sa)}
                end
                {rv1, rv2} = case Map.fetch(column_map(), right_col) do
                  {:ok, card_field} -> {Map.fetch!(c1, card_field), Map.fetch!(c2, card_field)}
                  _ ->
                    sa = String.to_atom(right_col)
                    {Map.fetch!(c1.stat_box, sa), Map.fetch!(c2.stat_box, sa)}
                end
                lv1 == rv2 and lv2 == rv1

              _ -> true
            end
        end)
      end)
      |> Enum.count(&(&1))

      {c1, in_filter}
    end)
  end
end
