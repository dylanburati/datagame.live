defmodule App.Entities.CardTagDef do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck
  alias App.Entities.CardTag

  schema "card_tag_def" do
    field :label, :string
    field :position, :integer
    field :value_counts, {:array, :map}, virtual: true

    belongs_to :deck, Deck
    has_many :tags, CardTag

    timestamps()
  end

  @doc false
  def changeset(card_tag_def, attrs) do
    card_tag_def
    |> cast(attrs, [:position, :label])
    |> validate_required([:position, :label])
  end
end
