defmodule AppWeb.GameView do
  use AppWeb, :view

  import App.Utils
  alias AppWeb.DeckView

  defp card_tag_json(label_map, []), do: %{}
  defp card_tag_json(label_map, [tag | remaining]) do
    card_tag_json(label_map, remaining)
    |> Map.update(label_map[tag.position], [], fn lst -> [tag.value | lst] end)
  end

  def card_json(label_map, card) do
    %{
      id: card.id,
      title: card.title,
      popularity: card.popularity,
      category: card.tag1,
    }
    |> maybe_put_lazy(
      is_map(label_map) and Ecto.assoc_loaded?(card.tags),
      :tags,
      fn -> card_tag_json(label_map, card.tags) end
    )
  end

  def render("game.json", %{deck: deck, cards: cards}) do
    label_map = cond do
      Ecto.assoc_loaded?(deck.card_tag_defs) ->
        for ct_def <- deck.card_tag_defs, into: %{}, do: {ct_def.position, ct_def.label}
      true -> nil
    end
    %{
      deck: DeckView.deck_json(deck),
      cards: Enum.map(cards, fn card -> card_json(label_map, card) end)
    }
  end
end
