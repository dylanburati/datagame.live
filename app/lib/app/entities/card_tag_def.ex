defmodule App.Entities.CardTagDef do
  @moduledoc """
  A record that describes the meaning of a set of CardTags within a specific
  deck. Ex. %CardTagDef{label: "Director", ...} might belong to %Deck{title: "Movies"}
  """

  use Ecto.Schema

  alias App.Entities.Deck
  alias App.Entities.CardTag

  @type t :: %__MODULE__{
    id: non_neg_integer,
    label: String.t,
    position: integer,
    deck_id: non_neg_integer,
    deck: Deck.t,
    tags: [CardTag.t],
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "card_tag_def" do
    field :label, :string
    field :position, :integer
    field :value_counts, {:array, :map}, virtual: true

    belongs_to :deck, Deck
    has_many :tags, CardTag

    timestamps()
  end
end
