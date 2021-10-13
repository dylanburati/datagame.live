defmodule App.Entities.RoomUser do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Room

  schema "room_user" do
    field :name, :string
    belongs_to :room, Room

    timestamps()
  end

  @doc false
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
