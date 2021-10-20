defmodule App.Entities.Deck do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Card
  alias App.Entities.CardTagDef
  alias App.Entities.CardStatDef
  alias App.Entities.DeckTag

  schema "deck" do
    field :category_label, :string
    field :spreadsheet_id, :string
    field :sheet_name, :string
    field :title, :string
    field :enabled_count, :integer
    field :has_popularity_count, :integer
    field :has_id_count, :integer
    field :has_tag1_count, :integer
    field :tag1_nunique, :integer
    field :image_url, :string
    field :image_dominant_color, :string
    field :category_counts, {:array, :map}, virtual: true

    has_many :cards, Card
    has_many :card_tag_defs, CardTagDef
    has_many :card_stat_defs, CardStatDef
    many_to_many :tags, DeckTag, join_through: "deck_deck_tag"

    timestamps()
  end

  def can_select_difficulty?(deck) do
    (deck.has_popularity_count / deck.enabled_count) >= 0.9
  end

  def can_select_categories?(deck) do
    (deck.tag1_nunique > 1) and ((deck.has_tag1_count / deck.enabled_count) >= 0.9)
  end

  @doc false
  def validations(deck) do
    deck
    |> validate_required([
      :spreadsheet_id, :sheet_name, :category_label,
      :enabled_count, :has_popularity_count, :has_id_count,
      :has_tag1_count, :tag1_nunique, :title
    ])
    |> validate_number(:enabled_count, greater_than: 0)
  end

  def constraints(deck) do
    deck
    |> unique_constraint([:spreadsheet_id, :sheet_name])
  end
end
