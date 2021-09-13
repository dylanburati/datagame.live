defmodule App.Entities.GameService do

  import Ecto.Query

  alias App.Repo
  alias App.Entities.Card
  alias App.Entities.DeckService

  defp sample_wor(n, k, limit) do
    # https://timvieira.github.io/blog/post/2019/09/16/algorithms-for-sampling-without-replacement/
    # Equivalent to scaling each weight by x_i ~ InverseExponential
    # This eliminates the need to rescale after removing a selection, so the lowest w_i*x_i
    # (=== highest 1/x_i/w_i) are a correct sample
    cond do
      n == 0 -> []
      true ->
        k = if k == 0, do: 0.001, else: k
        selector = for j <- 1..n, into: %{} do
          weight = :math.exp(-k * j / n)
          exp_distrib = :math.log(:rand.uniform())
          {j, -exp_distrib / weight}
        end
        selector
        |> Map.to_list()
        |> Enum.sort(fn {_1, v1}, {_2, v2} -> v1 < v2 end)
        |> Enum.take(limit)
        |> Enum.map(fn {j, _} -> j end)
    end
  end

  def get_cards(deck_id, difficulty, limit) do
    with {:ok, deck} <- DeckService.show(deck_id) do
      num_cards = Card
      |> where([c], c.deck_id == ^deck_id)
      |> where([c], c.is_disabled == false)
      |> select([c], count(c.id))
      |> Repo.one()

      k = min(10, max(-10, difficulty))
      choices = sample_wor(num_cards, k, limit)
      inner_query = from c in Card,
        where: c.deck_id == ^deck_id,
        where: c.is_disabled == false,
        select: %{card_id: c.id, rank: over(rank(), :popularity_w)},
        windows: [popularity_w: [order_by: [:popularity, :id]]]

      query = from q in subquery(inner_query),
        where: q.rank in ^choices,
        join: c in Card, on: c.id == q.card_id,
        select: c

      cards = query
      |> Repo.all()
      |> Repo.preload(:tags)
      |> Enum.shuffle()
      {:ok, %{deck: deck, cards: cards}}
    end
  end
end
