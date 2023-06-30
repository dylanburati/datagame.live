defmodule App.Entities.Deck do
  @moduledoc """
  An entity representing a single type of `Card`.
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.DeckTag

  @type t :: %__MODULE__{
    id: non_neg_integer,
    revision: integer,
    title: String.t,
    spreadsheet_id: String.t,
    image_url: String.t | nil,
    data: String.t,
    tags: [DeckTag.t],
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "deck" do
    field :revision, :integer
    field :title, :string
    field :spreadsheet_id, :string
    field :image_url, :string
    field :data, :string
    many_to_many :tags, DeckTag, join_through: "deck_deck_tag"

    timestamps()
  end

  @spec validations(deck :: Ecto.Changeset.t) :: Ecto.Changeset.t
  @doc false
  def validations(deck) do
    deck
    |> validate_required([:spreadsheet_id, :title])
    |> unique_constraint([:spreadsheet_id, :title])
  end

  def constraints(deck) do
    deck
  end
end
