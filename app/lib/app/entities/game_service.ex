defmodule App.Entities.GameService do

  import Ecto.Query

  alias App.Repo
  alias App.Entities.Card
  alias App.Entities.Deck
  alias App.Entities.DeckService

  defp sample_wor(enum, limit, weight_func, limit) do
    # https://timvieira.github.io/blog/post/2019/09/16/algorithms-for-sampling-without-replacement/
    # Equivalent to scaling each weight by x_i ~ InverseExponential
    # This eliminates the need to rescale after removing a selection, so the lowest w_i*x_i
    # (=== highest 1/x_i/w_i) are a correct sample
    case enum do
      [] -> []
      _ ->
        selector = for item <- enum do
          exp_distrib = :math.log(:rand.uniform())
          {item, -exp_distrib / weight_func.(item)}
        end
        selector
        |> Enum.sort(fn {_1, v1}, {_2, v2} -> v1 < v2 end)
        |> Enum.take(limit)
        |> Enum.map(fn {item, _} -> item end)
    end
  end

  defp full_score(deck, difficulty, category_boosts) do
    %{
      popularity_min: pmin,
      popularity_max: pmax,
      category_counts: cat_count_lst,
      enabled_count: enabled_count
    } = deck
    cat_counts = for %{name: name, count: count} <- cat_count_lst, into: %{}, do: {name, count}
    prange = pmax - pmin

    # positive difficulty means score(popularity: 0) > score(popularity: 1)
    pop_normalized = dynamic([c], fragment("exp(?)", ^difficulty * (c.popularity - ^pmin) / ^prange))

    weight_col = Enum.filter(category_boosts, fn {cat, _} -> Map.has_key?(cat_counts, cat) end)
    |> Enum.map(fn {cat, level} ->
      # Get mean boost P(0..y) of e^bx was flattened
      # numerator = (1/y) int_0^y e^bx = (1/by)(e^by - e^0) = (1/by)(e^by - 1)
      # denominator = int_0^1 e^bx = (1/b)(e^b - e^0) = (1/b)(e^b - 1)
      # --> (e^by - 1) / y(e^b - 1)
      unless level == 0 do
        frac = cat_counts[cat] / enabled_count
        {cat, (:math.exp(level * frac) - 1) / (frac * (:math.exp(level) - 1))}
      else
        {cat, 1.0}
      end
    end)
    |> Enum.reduce(pop_normalized,
      fn {cat, amount}, dyn_column ->
        dynamic(
          [c],
          ^dyn_column * fragment("case when ? = ? then ? else 1.0 end", c.tag1, ^cat, ^amount)
        )
      end
    )

    # https://timvieira.github.io/blog/post/2019/09/16/algorithms-for-sampling-without-replacement/
    # Divide the original distribution by an Exponential distrib
    # This eliminates the need to rescale after removing a selection, so the lowest k rows
    # follow the correct distribution for sampling without replacement
    dynamic([], ^weight_col / fragment("-log(random())"))
  end

  def get_cards(deck_id, difficulty, category_boosts, limit) do
    with {:ok, deck} <- DeckService.show(deck_id) do
      df = case Deck.can_select_difficulty?(deck) do
        true -> min(10, max(-10, difficulty))
        false -> 0
      end
      # upper limit at 20 as a precaution
      boosts_adj = case Deck.can_select_categories?(deck) do
        true -> category_boosts |> Enum.take(20) |> Enum.map(fn {cat, val} -> {cat, val * 0.3} end)
        false -> []
      end
      order_by = [
        asc: full_score(deck, df, boosts_adj),
        asc: :id
      ]
      query = from c in Card,
        where: c.deck_id == ^deck_id,
        where: c.is_disabled == false,
        order_by: ^order_by,
        limit: ^limit

      cards = query
      |> Repo.all()
      |> Repo.preload(:tags)

      {:ok, %{deck: deck, cards: cards}}
    end
  end
end
