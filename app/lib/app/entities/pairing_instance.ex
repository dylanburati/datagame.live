defmodule App.Entities.PairingInstance do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Card
  alias App.Entities.Pairing

  schema "pairing_instance" do
    field :subset, :string
    field :info, :string
    field :partition_number, :integer
    field :popularity, :float

    belongs_to :pairing, Pairing
    belongs_to :card1, Card, foreign_key: :card_id1, type: :binary_id
    belongs_to :card2, Card, foreign_key: :card_id2, type: :binary_id

    timestamps()
  end

  @doc false
  def changeset(pairing_instance, attrs) do
    pairing_instance
    |> cast(attrs, [:subset])
    |> validate_required([:subset])
  end
end
