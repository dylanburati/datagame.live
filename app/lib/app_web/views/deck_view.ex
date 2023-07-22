defmodule AppWeb.DeckView do
  require Logger
  use AppWeb, :view

  alias App.Entities.GameService

  def card_tag_def_json(card_tag_def) do
    %{
      id: card_tag_def.id,
      label: card_tag_def.label,
      valueCounts: card_tag_def.value_counts,
    }
  end

  def deck_json(deck) do
    result = %{
      id: deck.id,
      title: deck.title,
      imageUrl: deck.image_url,
      imageDominantColor: "rgb(96, 96, 96)",
      createdAt: deck.inserted_at,
      updatedAt: deck.updated_at,
    }
    with {:ok, _, deck_details} <- App.Native.cached_trivia_base(),
         dextra = Enum.find(deck_details, fn d -> d.id == deck.id end),
         false <- is_nil(dextra) do
      Map.merge(result, %{
        canSelectDifficulty: dextra.can_select_difficulty,
        canSelectCategories: GameService.can_select_categories?(dextra),
        categoryCounts: Enum.map(dextra.category_counts, fn {k, v} -> %{name: k, count: v} end)
      })
    else
      {:error, err} ->
        Logger.error(err)
        result
      true ->
        Logger.error("Deck ID not in trivia base")
        result
    end
  end

  def render("decks.json", %{decks: decks}) do
    Enum.map(decks, &deck_json/1)
  end

  def render("deck.json", %{deck: deck}) do
    deck_json(deck)
  end
end
