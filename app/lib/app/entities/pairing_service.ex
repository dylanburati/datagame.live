defmodule App.Entities.PairingService do
  import App.Utils
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
    radius_km = 6378.137

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
          ids = case Keyword.get(opts, :subtract) do
            nil -> sample_pairs(pairing, difficulty, 4 * limit)
            subset ->
              possible_ids = sample_pairs(pairing, difficulty, 4 * limit)
              combined_ids = Enum.map(possible_ids, fn {id1, id2} -> id1 <> id2 end)
              subtractquery = from p in PairingInstance,
                join: c1 in assoc(p, :card1),
                join: c2 in assoc(p, :card2),
                select: {c1.id, c2.id},
                where: p.pairing_id == ^pairing.id,
                where: p.subset == ^subset,
                where: (fragment("concat(?,?)", c1.id, c2.id) in ^combined_ids)
                       or (fragment("concat(?,?)", c2.id, c1.id) in ^combined_ids)
              subtract_ids = subtractquery |> Repo.all() |> MapSet.new()
              MapSet.new(possible_ids) |> MapSet.difference(subtract_ids)
          end
          id_filter = Enum.reduce(ids, dynamic([], false), fn {id1, id2}, acc ->
            dynamic([c1, c2], ^acc or (c1.id == ^id1 and c2.id == ^id2))
          end)
          query = from c1 in Card,
            cross_join: c2 in Card,
            select: {c1, c2, %{}},
            where: ^id_filter,
            limit: ^limit
          query |> Repo.all()
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
            {_, funcname} = Enum.find(aggs, &(elem(&1, 0) == card_stat_def.key))
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

  defp cascade_error([]), do: {:ok, []}
  defp cascade_error([:error | _]), do: :error
  defp cascade_error([{:ok, v} | rest]) do
    case cascade_error(rest) do
      {:ok, lst} -> {:ok, [v | lst]}
      _ -> :error
    end
  end

  def sample_pairs(pairing, difficulty, limit) do
    cache_ns = "PairingService.sample_pairs.#{pairing.id}.#{pairing.updated_at}"
    subkeys = sample_without_replacement(0..99, 10)
    tasks = Enum.map(subkeys, fn sk ->
      Task.async(fn ->
        cache_key = "#{cache_ns}.#{sk}"
        case App.Cache.lookup(cache_key) do
          nil -> :error
          lst ->
            items = Enum.map(lst, fn {id1, pop1, id2, pop2} ->
              w = :math.exp(difficulty * pop1 * pop2)
              prio = -w / :math.log(:rand.uniform())
              {prio, id1, pop1, id2, pop2}
            end)
            |> sample_without_replacement(limit, &(elem(&1, 0)))
            {:ok, items}
        end
      end)
    end)
    results = Task.await_many(tasks)

    lists = case cascade_error(results) do
      {:ok, r} -> r
      :error ->
        edges = generate_all_pairs(pairing)
        Stream.chunk_every(edges, ceil(length(edges) / 100))
        |> Stream.with_index()
        |> Enum.reduce([], fn {lst, sk}, acc ->
          :ok = App.Cache.insert("#{cache_ns}.#{sk}", lst)

          if sk in subkeys do
            items = Enum.map(lst, fn {id1, pop1, id2, pop2} ->
              w = :math.exp(difficulty * pop1 * pop2)
              prio = -w / :math.log(:rand.uniform())
              {prio, id1, pop1, id2, pop2}
            end)
            |> sample_without_replacement(limit, &(elem(&1, 0)))
            [items | acc]
          else
            acc
          end
        end)
    end
    Enum.concat(lists)
    |> Enum.sort_by(&(elem(&1, 0)))
    |> Enum.reduce({[], %{}}, fn {sort, id1, pop1, id2, pop2}, {pairs, counter} ->
      occurs = Map.get(counter, id1, 0) + Map.get(counter, id2, 0)
      discounted = {sort * :math.pow(1.3, occurs), id1, pop1, id2, pop2}
      {pairs ++ [discounted],
        counter |> Map.update(id1, 1, &(&1 + 1)) |> Map.update(id2, 1, &(&1 + 1))}
    end)
    |> elem(0)
    |> Enum.sort_by(&(elem(&1, 0)))
    |> Enum.map(fn {_, id1, _, id2, _} -> {id1, id2} end)
    |> Enum.take(limit)
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
      where: ^indep_conds,
      order_by: c1.id

    candidates = stage1_query |> Repo.all()

    candidates
    |> Enum.flat_map(fn c1 ->
      Enum.take_while(candidates, fn c2 -> c2.id <= c1.id end)
      |> Enum.filter(fn c2 -> eval_join_conditions(cond_lst, c1, c2) end)
      |> Enum.map(fn c2 ->
        {c1.id, c1.popularity, c2.id, c2.popularity}
      end)
    end)
  end
end
