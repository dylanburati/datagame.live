defmodule App.Entities.DeckService do

  import Ecto.Query

  alias App.Repo
  alias App.Entities.Deck
  alias App.Entities.Card
  alias App.Entities.CardTag
  alias App.Entities.CardTagDef

  def list() do
    Repo.all(Deck)
  end

  defp fill_out_category_counts(deck) do
    query = from c in Card,
      where: c.deck_id == ^deck.id,
      where: c.is_disabled == false,
      where: not is_nil(c.tag1),
      group_by: [c.tag1],
      select: {c.tag1, count(c.id)},
      order_by: [desc: count(c.id)],
      limit: 10

    category_counts = query
    |> Repo.all()
    |> Enum.map(fn {val, count} -> %{name: val, count: count} end)

    %Deck{deck | category_counts: category_counts}
  end

  defp fill_out_value_counts(deck) do
    updated_ctdefs = deck.card_tag_defs
    |> Enum.map(fn ctdef ->
      def_value_counts = ctdef.tags
      |> Enum.map(fn tag -> %{value: tag.value, count: tag.count} end)
      |> Enum.take(16)
      %CardTagDef{ctdef | value_counts: def_value_counts}
    end)
    %Deck{deck | card_tag_defs: updated_ctdefs}
  end

  def show(id) do
    case Repo.get(Deck, id) do
      nil -> {:error, "Invalid ID #{id}"}
      deck ->
        deck = deck
        |> fill_out_category_counts()
        |> Repo.preload([card_tag_defs: [tags: from(ct in CardTag, order_by: [desc: ct.count])]])
        |> fill_out_value_counts()

        {:ok, deck}
        #  %Deck{deck | card_tag_defs: deck.card_tag_defs |> Enum.map(&fill_out_value_counts/1)}}
    end
  end

  def show!(id) do
    case show(id) do
      {:ok, result} -> result
      {:error, reason} -> raise KeyError, message: reason
    end
  end
end
