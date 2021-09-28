defmodule App.Entities.CardTag do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Card
  alias App.Entities.CardTagDef

  schema "card_tag" do
    field :value, :string

    belongs_to :definition, CardTagDef, foreign_key: :card_tag_def_id
    many_to_many :cards, Card, join_through: "card_card_tag"
  end

  @doc false
  def changeset(card_tag, attrs) do
    card_tag
    |> cast(attrs, [:value])
    |> validate_required([:value])
  end
end
