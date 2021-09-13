defmodule App.Entities.CardTag do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Card

  schema "card_tag" do
    field :position, :integer
    field :value, :string

    belongs_to :card, Card

    timestamps()
  end

  @doc false
  def changeset(card_tag, attrs) do
    card_tag
    |> cast(attrs, [:position, :value])
    |> validate_required([:position, :value])
  end
end
