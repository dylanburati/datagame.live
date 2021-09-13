defmodule App.Entities.Deck do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Card
  alias App.Entities.CardTagDef
  alias App.Entities.DeckTag

  schema "deck" do
    field :category_label, :string
    field :spreadsheet_id, :string
    field :title, :string
    field :category_counts, {:array, :map}, virtual: true

    has_many :cards, Card
    has_many :card_tag_defs, CardTagDef
    has_many :tags, DeckTag

    timestamps()
  end

  @doc false
  def changeset(deck, attrs) do
    deck
    |> cast(attrs, [:title, :spreadsheet_id, :category_label])
    |> validate_required([:title, :spreadsheet_id, :category_label])
  end
end
