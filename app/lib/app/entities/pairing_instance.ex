defmodule App.Entities.PairingInstance do
  @moduledoc """
  An instance of a pairing which fits into a subset of that pairing -
  e.g. a pairing on the deck `"People"` might have instances for the
  subset `"married_couple"`.
  """

  use Ecto.Schema

  alias App.Entities.Card
  alias App.Entities.Pairing

  @type t :: %__MODULE__{
    id: non_neg_integer,
    subset: String.t,
    info: String.t,
    pairing_id: non_neg_integer,
    pairing: Pairing.t,
    card_id1: String.t,
    card_id2: String.t,
    card1: Card.t,
    card2: Card.t,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "pairing_instance" do
    field :subset, :string
    field :info, :string

    belongs_to :pairing, Pairing
    belongs_to :card1, Card, foreign_key: :card_id1, type: :binary_id
    belongs_to :card2, Card, foreign_key: :card_id2, type: :binary_id

    timestamps()
  end
end
