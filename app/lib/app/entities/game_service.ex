defmodule App.Entities.GameService do
  @moduledoc """
  A service for games that run with a list of one deck's cards.
  """

  def can_select_categories?(deck) do
    if map_size(deck.category_counts) <= 1 do
      false
    else
      Enum.sum(Map.values(deck.category_counts)) / deck.enabled_count >= 0.9
    end
  end

  @spec get_cards(deck_id :: integer,
                  difficulty :: float,
                  category_boosts :: [{String.t, float}],
                  limit :: non_neg_integer) :: {:ok, %{cards: [Card.t], deck: Deck.t}} | {:error, String.t}
  @doc """
  Samples cards from the given deck, adjusting each card's probability of inclusion
  based on the other arguments.
  """
  def get_cards(deck_id, difficulty, category_boosts, limit) do
    with {:ok, kb, _} <- App.Native.cached_trivia_base() do
      App.Native.get_cards(
        kb, deck_id, min(10, max(-10, difficulty)), category_boosts, limit
      )
    end
  end
end
