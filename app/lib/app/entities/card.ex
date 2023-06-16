defmodule App.Entities.Card do
  @moduledoc """
  An entity representing an identifiable thing - cards are organized into a
  `Deck`, which defines what kind of cards it contains, and what additional
  info is known about them (via `CardStatDef` and `CardTagDef`).
  """

  use App.SchemaWithUUID

  alias App.Entities.Deck
  alias App.Entities.CardTag

  @type stats :: %{
    stat1: String.t,
    stat2: String.t,
    stat3: String.t,
    stat4: String.t,
    stat5: String.t,
  }
  @type t :: %__MODULE__{
    id: String.t,
    title: String.t,
    unique_id: String.t | nil,
    is_disabled: boolean,
    notes: String.t,
    popularity: float,
    popularity_unscaled: float,
    cat1: String.t | nil,
    cat2: String.t | nil,
    stat_box: stats,
    deck_id: non_neg_integer,
    deck: Deck.t,
    tags: [CardTag.t],
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "card" do
    field :is_disabled, :boolean, default: false
    field :notes, :string
    field :popularity, :float
    field :cat1, :string
    field :cat2, :string
    field :title, :string
    # {deck, unique_id} is unique to allow per-card settings to stay across deck updates
    # cards without a unique_id are always deleted when the deck is updated
    field :unique_id, :string
    field :popularity_unscaled, :float

    embeds_one :stat_box, CardStatBox, on_replace: :delete, primary_key: false do
      field :stat1, :string
      field :stat2, :string
      field :stat3, :string
      field :stat4, :string
      field :stat5, :string
    end

    belongs_to :deck, Deck, type: :id
    many_to_many :tags, CardTag, join_through: "card_card_tag"

    timestamps()
  end

  @spec column_map() :: map
  @doc """
  Returns a map from Card field names to field keys for the fields with scalar,
  human-readable values.
  """
  def column_map() do
    %{
      "title" => :title,
      "popularity" => :popularity,
      "cat1" => :cat1,
      "cat2" => :cat2
    }
  end

  @spec key_for_stat(String.t) :: atom | nil
  @doc """
  Gets the StatBox field referred to by the given spreadsheet column suffix, or nil if the
  suffix is invalid.
  """
  def key_for_stat(which_stat) do
    case which_stat do
      "1" -> :stat1
      "2" -> :stat2
      "3" -> :stat3
      "4" -> :stat4
      "5" -> :stat5
      _ -> nil
    end
  end

  @spec sheet_col_for_stat(atom) :: String.t | nil
  @doc """
  Gets the spreadsheet column title referred to by the given StatBox field key, or nil if the
  key is invalid.
  """
  def sheet_col_for_stat(key) do
    case key do
      :stat1 -> "Stat1"
      :stat2 -> "Stat2"
      :stat3 -> "Stat3"
      :stat4 -> "Stat4"
      :stat5 -> "Stat5"
      _ -> nil
    end
  end

  @spec all_stat_keys() :: [atom]
  @doc """
  Lists the keys for fields in the StatBox struct.
  """
  def all_stat_keys() do
    [:stat1, :stat2, :stat3, :stat4, :stat5]
  end
end
