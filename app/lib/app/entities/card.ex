defmodule App.Entities.Card do
  use App.SchemaWithUUID

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
    field :popularity_unscaled, :float

    embeds_one :stat_box, CardStatBox, on_replace: :delete, primary_key: false do
      field :stat1, :string
      field :stat2, :string
      field :stat3, :string
    end

    belongs_to :deck, Deck, type: :id
    many_to_many :tags, CardTag, join_through: "card_card_tag"

    timestamps()
  end

  def key_for_stat(which_stat) do
    case which_stat do
      "1" -> :stat1
      "2" -> :stat2
      "3" -> :stat3
      _ -> nil
    end
  end

  def sheet_col_for_stat(key) do
    case key do
      :stat1 -> "Stat1"
      :stat2 -> "Stat2"
      :stat3 -> "Stat3"
      _ -> nil
    end
  end

  def all_stat_keys() do
    [:stat1, :stat2, :stat3]
  end
end
