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
      where: c.is_disabled == false,
      where: c.deck_id == ^deck.id,
      group_by: [c.tag1],
      select: {c.tag1, count(c.id)},
      order_by: [desc: count(c.id)],
      limit: 10

    category_counts = query
    |> Repo.all()
    |> Enum.map(fn {val, count} -> %{name: val, count: count} end)

    %Deck{deck | category_counts: category_counts}
  end

  defp fill_out_value_counts(card_tag_def) do
    query = from ct in CardTag,
      join: c in Card, on: c.id == ct.card_id,
      where: c.is_disabled == false,
      where: c.deck_id == ^card_tag_def.deck_id,
      where: ct.position == ^card_tag_def.position,
      group_by: [ct.value],
      select: {ct.value, count(c.id)},
      order_by: [desc: count(c.id)],
      limit: 15

    value_counts = query
    |> Repo.all()
    |> Enum.map(fn {val, count} -> %{value: val, count: count} end)

    %CardTagDef{card_tag_def | value_counts: value_counts}
  end

  def show(id) do
    case Repo.get(Deck, id) do
      nil -> {:error, "Invalid ID #{id}"}
      deck ->
        deck = deck
        |> fill_out_category_counts()
        |> Repo.preload(:card_tag_defs)

        {:ok,
         %Deck{deck | card_tag_defs: deck.card_tag_defs |> Enum.map(&fill_out_value_counts/1)}}
    end
  end
end
