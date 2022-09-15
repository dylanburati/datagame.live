defmodule App.Entities.PairingService do
  import App.Utils
  import Ecto.Query
  import App.Entities.Card, only: [column_map: 0]

  alias App.MathExtensions
  alias App.Repo
  alias App.Entities.Card
  alias App.Entities.PairingInstance

  def validate_aggs(_deck, []), do: :ok
  def validate_aggs(deck, [{stat_key, funcname} | rest]) do
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

  def calc_agg(_stat_def, "geodist", v1, v2) do
    [lat1, lon1] = String.split(v1, ",")
    |> Enum.map(&(parse_float!(&1) * :math.pi / 180.0))
    [lat2, lon2] = String.split(v2, ",")
    |> Enum.map(&(parse_float!(&1) * :math.pi / 180.0))

    MathExtensions.geodist(lat1, lon1, lat2, lon2)
  end

  def to_exp_dist(w) do
    -1.0 * :math.exp(w) / :math.log(:rand.uniform())
  end

  def card_exp_dist(c, d, penalty \\ 0) do
    to_exp_dist(c.popularity * d + penalty)
  end

  def update_card_items(map, cards) do
    Enum.reduce(cards, map, fn c, acc ->
      Map.update!(acc, c.id, fn {_, t} -> {c, t + 1} end)
    end)
  end

  def candidates_impl(pairing) do
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

    query = from c1 in Card,
      where: c1.deck_id == ^pairing.deck_id,
      where: c1.is_disabled == false,
      where: ^indep_conds,
      order_by: c1.id
    query |> Repo.all()
  end

  def candidates(pairing) do
    cache_key = "PairingService.candidates.#{pairing.id}.#{pairing.updated_at}"
    case App.Cache.lookup(cache_key) do
      nil ->
        result = candidates_impl(pairing)
        :ok = App.Cache.insert(cache_key, result)
        result
      cached -> cached
    end
  end

  def pair_id(id1, id2) when is_binary(id1) and is_binary(id2) do
    if id1 < id2, do: {id1, id2}, else: {id2, id1}
  end
  def pair_id(c1, c2), do: pair_id(c1.id, c2.id)

  def subset_impl(pairing, name) do
    query = from p in PairingInstance,
      select: {p.card_id1, p.card_id2, p.info},
      where: p.pairing_id == ^pairing.id,
      where: p.subset == ^name
    query
    |> Repo.all()
    |> Enum.reduce(
      {MapSet.new(), MapSet.new(), %{}},
      fn {cid1, cid2, extra}, {indiv, pairs, emap} ->
        {indiv |> MapSet.put(cid1) |> MapSet.put(cid2),
         MapSet.put(pairs, pair_id(cid1, cid2)),
         maybe_put(emap, not is_nil(extra), pair_id(cid1, cid2), extra)}
      end
    )
  end

  def subset(pairing, name) do
    cache_key = "PairingService.subset.#{pairing.id}.#{pairing.updated_at}.#{name}"
    case App.Cache.lookup(cache_key) do
      nil ->
        result = subset_impl(pairing, name)
        :ok = App.Cache.insert(cache_key, result)
        result
      cached -> cached
    end
  end

  def sample_pairs(pairing, difficulty, limit, opts \\ []) do
    %{"filter" => cond_lst} = pairing.criteria
    boost_lst = Map.get(pairing.criteria, "boost", [])
    {_, subtract_pairs, _} = case Keyword.get(opts, :subtract) do
      nil -> {nil, MapSet.new(), nil}
      name -> subset(pairing, name)
    end
    {intersect_ids, intersect_pairs, info_map} = case Keyword.get(opts, :intersect) do
      nil -> {nil, nil, %{}}
      name -> subset(pairing, name)
    end

    halfdif = difficulty * 0.5
    cards = candidates(pairing)
    |> maybe_filter(not is_nil(intersect_ids), fn c -> c.id in intersect_ids end)
    stage1 = cards
    |> sample_without_replacement(limit, &(card_exp_dist(&1, halfdif)))
    stage2 = Map.new(cards, &{&1.id, {&1, 0}})
    |> update_card_items(stage1)

    {result, _} = Enum.reduce(stage1, {[], stage2}, fn c1, {acc, remaining} ->
      choices = Map.values(remaining)
      |> Enum.filter(fn {c2, _} -> eval_join_conditions(cond_lst, c1, c2) end)
      |> maybe_filter(not is_nil(subtract_pairs), fn {c2, _} -> pair_id(c1, c2) not in subtract_pairs end)
      |> maybe_filter(not is_nil(intersect_pairs), fn {c2, _} -> pair_id(c1, c2) in intersect_pairs end)
      |> sample_without_replacement(1, fn {c2, repeats} ->
        to_exp_dist(eval_popularity(boost_lst, c1, c2, pairing.deck) * halfdif + 0.5 * repeats)
      end)
      |> Enum.map(&elem(&1, 0))

      records = Enum.map(choices, fn c2 -> {c1, c2, Map.get(info_map, pair_id(c1, c2))} end)
      {records ++ acc, remaining |> update_card_items(choices)}
    end)
    result
  end

  defp card_fetch(card, col_name) do
    case Map.fetch(column_map(), col_name) do
      {:ok, card_field} -> Map.fetch!(card, card_field)
      _ ->
        sa = String.to_atom(col_name)
        Map.fetch!(card.stat_box, sa)
    end
  end

  def eval_join_conditions([], _, _), do: true
  def eval_join_conditions([cnd | rest], card1, card2) do
    curr = case cnd do
      ["mismatch", col_name] ->
        card_fetch(card1, col_name) != card_fetch(card2, col_name)

      ["match", left_col, right_col] ->
        (card_fetch(card1, left_col) == card_fetch(card2, right_col)
         and card_fetch(card2, left_col) == card_fetch(card1, right_col))

      _ -> true
    end
    curr and eval_join_conditions(rest, card1, card2)
  end

  def eval_popularity([], _card1, card2, _deck), do: card2.popularity
  def eval_popularity([cnd | rest], card1, card2, deck) do
    curr = case cnd do
      ["abs_difference", boost_when, thresh, strength, col] ->
        v1 = card_fetch(card1, col)
        v2 = card_fetch(card2, col)
        {valid, diff} = case Enum.find(deck.card_stat_defs, &(&1.key == col)) do
          nil -> {false, 0}
          %{stat_type: "date"} ->
            with true <- is_binary(v1), true <- is_binary(v2),
                 {:ok, d1} <- Date.from_iso8601(v1), {:ok, d2} <- Date.from_iso8601(v2) do
              {true, abs(Date.diff(d1, d2) / 365.2425)}
            else
              _ -> {false, 0}
            end
          _ -> {false, 0}
        end
        should_apply = case {valid, boost_when} do
          {false, _} -> false
          {true, "<"} -> diff < thresh
          {true, ">"} -> diff > thresh
        end
        if should_apply, do: strength, else: 0.0
      _ -> 0.0
    end
    curr + eval_popularity(rest, card1, card2, deck)
  end
end
