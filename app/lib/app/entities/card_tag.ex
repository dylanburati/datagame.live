defmodule App.Entities.CardTag do
  @moduledoc """
  An entity connected to a card. A card can have any number of tags for
  a particular CardTagDef. A tag is always connected to one or more cards.
  """

  use App.SchemaWithUUID

  alias App.Entities.Card
  alias App.Entities.CardTagDef

  @type t :: %__MODULE__{
    id: String.t,
    value: String.t,
    card_tag_def_id: non_neg_integer,
    definition: CardTagDef.t,
    cards: [Card.t]
  }

  schema "card_tag" do
    field :value, :string
    field :count, :integer

    belongs_to :definition, CardTagDef, foreign_key: :card_tag_def_id, type: :id
    many_to_many :cards, Card, join_through: "card_card_tag"
  end
end
