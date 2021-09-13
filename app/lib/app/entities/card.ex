defmodule App.Entities.Card do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck
  alias App.Entities.CardTag

  schema "card" do
    field :is_disabled, :boolean, default: false
    field :notes, :string
    field :popularity, :float
    field :tag1, :string
    field :title, :string
    # {deck, unique_id} is unique to allow per-card settings to stay across deck updates
    # cards without a unique_id are always deleted when the deck is updated
    field :unique_id, :string

    belongs_to :deck, Deck
    has_many :tags, CardTag

    timestamps()
  end

  @doc false
  def changeset(card, attrs) do
    card
    |> cast(attrs, [:title, :is_disabled, :popularity, :unique_id, :tag1, :notes])
    |> validate_required([:title, :is_disabled])
  end
end
