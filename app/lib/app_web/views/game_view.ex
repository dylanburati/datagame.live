defmodule AppWeb.GameView do
  use AppWeb, :view

  import App.Utils
  alias AppWeb.DeckView

  defp card_tag_json([]), do: %{}
  defp card_tag_json([tag | remaining]) do
    card_tag_json(remaining)
    |> Map.update(tag.definition.label, [], fn lst -> [tag.value | lst] end)
  end

  def card_json(card) do
    %{
      id: card.id,
      title: card.title,
      popularity: card.popularity,
      category: card.tag1,
    }
    |> maybe_put_lazy(Ecto.assoc_loaded?(card.tags), :tags, fn ->
      card_tag_json(card.tags)
    end)
  end

  def render("game.json", %{deck: deck, cards: cards}) do
    %{
      deck: DeckView.deck_json(deck),
      cards: Enum.map(cards, &card_json/1)
    }
  end
end
