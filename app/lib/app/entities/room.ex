defmodule App.Entities.Room do
  use Ecto.Schema
  import Ecto.Changeset
  alias App.Entities.RoomUser

  schema "room" do
    field :code, :string
    belongs_to :creator, RoomUser
    has_many :users, RoomUser

    timestamps()
  end

  @doc false
  def validations(room) do
    room
    |> validate_required([:code])
    |> unique_constraint([:code])
  end
end
