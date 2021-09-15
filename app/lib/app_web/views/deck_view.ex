defmodule AppWeb.DeckView do
  use AppWeb, :view

  import App.Utils

  alias App.Entities.Deck

  def card_tag_def_json(card_tag_def) do
    %{
      id: card_tag_def.id,
      label: card_tag_def.label,
      valueCounts: card_tag_def.value_counts,
    }
  end

  def deck_json(deck) do
    %{
      id: deck.id,
      title: deck.title,
      numEnabledCards: deck.enabled_count,
      canSelectDifficulty: Deck.can_select_difficulty?(deck),
      canSelectCategories: Deck.can_select_categories?(deck),
    }
    |> maybe_put(is_list(deck.category_counts), :categoryCounts, deck.category_counts)
    |> maybe_put_lazy(
      Ecto.assoc_loaded?(deck.card_tag_defs),
      :tagDefinitions,
      fn -> Enum.map(deck.card_tag_defs, &card_tag_def_json/1) end
    )
  end

  def render("decks.json", %{decks: decks}) do
    Enum.map(decks, &deck_json/1)
  end

  def render("deck.json", %{deck: deck}) do
    deck_json(deck)
  end
end
