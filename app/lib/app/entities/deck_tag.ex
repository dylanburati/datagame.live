defmodule App.Entities.DeckTag do
  @moduledoc """
  An entity used to categorize `Deck`s. Currently unused.
  """

  use Ecto.Schema

  alias App.Entities.Deck

  @type t :: %__MODULE__{
    id: non_neg_integer,
    value: String.t,
    decks: [Deck.t]
  }

  schema "deck_tag" do
    field :value, :string

    many_to_many :decks, Deck, join_through: "deck_deck_tag"
  end
end
