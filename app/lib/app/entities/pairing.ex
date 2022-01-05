defmodule App.Entities.Pairing do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck

  schema "pairing" do
    field :criteria, :map
    field :name, :string

    belongs_to :deck, Deck
    timestamps()
  end

  @doc false
  def changeset(pairing, attrs) do
    pairing
    |> cast(attrs, [:name, :criteria])
    |> validate_required([:name, :criteria])
  end
end
