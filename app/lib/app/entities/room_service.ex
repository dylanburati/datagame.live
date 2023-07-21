defmodule App.Entities.RoomService do
  import Ecto.Changeset
  import Ecto.Query

  alias App.Repo
  alias App.Entities.Room
  alias App.Entities.RoomUser

  @spec create(String.t) :: {:ok, Room.t, RoomUser.t} | {:error, any} | {:error, atom, any, any}
  @doc """
  Creates a new `Room` and `RoomUser`.
  """
  def create(host_nickname) do
    creator_changeset = %RoomUser{}
    |> change(name: host_nickname)
    |> RoomUser.validations()

    room_changeset = %Room{}
    |> change()
    |> Room.validations()

    result = Ecto.Multi.new
    |> Ecto.Multi.insert(
      :room_user, creator_changeset, returning: [:id]
    )
    |> Ecto.Multi.insert(
      :room, fn %{room_user: room_user} ->
        room_changeset |> change(creator: room_user)
      end,
      returning: [:id]
    )
    |> Ecto.Multi.update(
      :update_room_user, fn %{room_user: room_user, room: room} ->
        %RoomUser{id: room_user.id} |> change(room: room)
      end
    )
    |> Repo.transaction()

    with {:ok, %{room: room, room_user: room_user}} <- result do
      {:ok,
       Map.put(room, :code, Room.id_to_code(room.id)),
       room_user}
    end
  end

  @spec get_by_code(room_code :: String.t) :: {:ok, Room.t} | {:error, String.t}
  @doc """
  Gets a `Room` by code, and loads the associated creator and room users.
  """
  def get_by_code(room_code) do
    with {:ok, room_id} <- Room.code_to_id(room_code) do
      room_q = preload(Room, [:creator, :users])
      case Repo.get(room_q, room_id) do
        %Room{} = room -> {:ok, %{room | code: room_code}}
        _ -> {:error, "Room #{room_code} not found"}
      end
    else
      _ -> {:error, "Invalid room code format"}
    end
  end

  @spec get_user_in_room(room_code :: String.t, user_id :: non_neg_integer) :: {:ok, RoomUser.t} | {:error, String.t}
  @doc """
  Gets a `RoomUser` by room code and ID.
  """
  def get_user_in_room(room_code, user_id) do
    with {:ok, room_id} <- Room.code_to_id(room_code) do
      query = from ru in RoomUser,
        join: r in assoc(ru, :room),
        where: r.id == ^room_id,
        where: ru.id == ^user_id
      case Repo.one(query) do
        %RoomUser{} = room_user -> {:ok, room_user}
        _ -> {:error, "Room user not found"}
      end
    else
      _ -> {:error, "Invalid room code format"}
    end
  end

  @spec join(room :: Room.t, name :: String.t) :: {:ok, RoomUser.t} | {:error, Ecto.Changeset.t}
  @doc """
  Creates a `RoomUser` for an existing room.
  """
  def join(room, name) do
    %RoomUser{}
    |> change(name: name, room: room)
    |> RoomUser.validations()
    |> Repo.insert()
  end

  @spec change_user_name(room_user :: RoomUser.t, name :: String.t) :: {:ok, RoomUser.t} | {:error, Ecto.Changeset.t}
  @doc """
  Updates a `RoomUser`'s name.
  """
  def change_user_name(room_user, name) do
    room_user
    |> change(name: name)
    |> RoomUser.validations()
    |> Repo.update()
  end
end
