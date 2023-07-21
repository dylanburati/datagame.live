defmodule App.Entities.Room do
  @moduledoc """
  An entity which records the creation and user membership in a live trivia
  session managed by `AppWeb.RoomProcess`.
  """

  use Ecto.Schema
  import Ecto.Changeset
  import App.Utils

  alias App.Entities.RoomUser

  @type t :: %__MODULE__{
    id: non_neg_integer,
    code: String.t,
    creator_id: non_neg_integer,
    creator: RoomUser.t,
    users: [RoomUser.t],
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "room" do
    field :code, :string, virtual: true
    belongs_to :creator, RoomUser
    has_many :users, RoomUser

    timestamps()
  end

  @code_alpha "ABCEFHJLMNRSTVXZ"

  @spec id_to_code(non_neg_integer) :: String.t
  @doc """
  Converts from a numeric ID to a 4-letter code.
  """
  def id_to_code(room_id) do
    cond do
      room_id < 0x10000 ->
        to_base16(rem(room_id * 6561, 0x10000), @code_alpha)
        |> String.pad_leading(4, "A")
      true ->
        to_base16(room_id, @code_alpha)
    end
  end

  @spec code_to_id(String.t) :: {:ok, non_neg_integer} | :error
  @doc """
  Converts from a 4-letter code back to a numeric ID.
  """
  def code_to_id(room_code) do
    with {:ok, num} <- from_base16(room_code, @code_alpha) do
      cond do
        num < 0x10000 -> {:ok, rem(num * 2657, 0x10000)}
        true -> {:ok, num}
      end
    end
  end

  @spec validations(Ecto.Changeset.t) :: Ecto.Changeset.t
  def validations(room) do
    room
    |> cast(%{}, [])
    |> assoc_constraint(:creator)
  end
end
