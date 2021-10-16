defmodule App.Entities.Room do
  use Ecto.Schema
  import Ecto.Changeset
  alias App.Entities.RoomUser

  schema "room" do
    field :code, :string, virtual: true
    belongs_to :creator, RoomUser
    has_many :users, RoomUser

    timestamps()
  end

  @doc false
  def validations(room) do
    room
    |> cast(%{}, [])
    |> assoc_constraint(:creator)
  end
end
