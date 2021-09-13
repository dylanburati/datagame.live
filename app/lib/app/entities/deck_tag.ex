defmodule App.Entities.DeckTag do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck

  schema "deck_tag" do
    field :value, :string

    belongs_to :deck, Deck

    timestamps()
  end

  @doc false
  def changeset(deck_tag, attrs) do
    deck_tag
    |> cast(attrs, [:value])
    |> validate_required([:value])
  end
end
