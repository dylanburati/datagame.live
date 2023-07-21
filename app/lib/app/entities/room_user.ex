defmodule App.Entities.RoomUser do
  @moduledoc """
  An entity created when a user joins a room, in order to recognize them
  when rejoining.
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Room

  @type t :: %__MODULE__{
    id: non_neg_integer,
    name: String.t,
    room_id: non_neg_integer,
    room: Room.t,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "room_user" do
    field :name, :string
    belongs_to :room, Room

    timestamps()
  end

  @spec validations(Ecto.Changeset.t) :: Ecto.Changeset.t
  def validations(room_user) do
    room_user
    |> validate_required([:name])
    |> validate_format(:name, ~r/^[^\s].*[^\s]$/,
      message: "must be at least 2 characters with no leading or trailing spaces"
    )
    |> validate_format(:name, ~r/^[^\r\n\t]+$/,
      message: "must not contain tabs or line breaks"
    )
    |> unique_constraint([:room_id, :name])
  end
end
