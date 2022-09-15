defmodule App.Entities.Room do
  use Ecto.Schema
  import Ecto.Changeset
  import App.Utils

  alias App.Entities.RoomUser

  schema "room" do
    field :code, :string, virtual: true
    belongs_to :creator, RoomUser
    has_many :users, RoomUser

    timestamps()
  end

  @code_alpha "ABCEFHJKMNRSTVXZ"
  # random looking codes without the birthday paradox
  def id_to_code(room_id) do
    cond do
      room_id < 0x10000 ->
        to_base16(rem(room_id * 6561, 0x10000), @code_alpha)
        |> String.pad_leading(4, "A")
      true ->
        to_base16(room_id, @code_alpha)
    end
  end

  def code_to_id(room_code) do
    with {:ok, num} <- from_base16(room_code, @code_alpha) do
      cond do
        num < 0x10000 -> {:ok, rem(num * 2657, 0x10000)}
        true -> {:ok, num}
      end
    end
  end

  @doc false
  def validations(room) do
    room
    |> cast(%{}, [])
    |> assoc_constraint(:creator)
  end
end
