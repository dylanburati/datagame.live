defmodule App.Entities.RoomService do
  import Ecto.Changeset
  import Ecto.Query

  alias App.Repo
  alias App.Entities.Room
  alias App.Entities.RoomUser

  def create(host_nickname) do
    creator_changeset = %RoomUser{}
    |> change(name: host_nickname)
    |> RoomUser.validations()

    room_changeset = %Room{}
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

    with {:ok, rmap = %{room: room}} <- result do
      {:ok,
       %{rmap | room: Map.put(room, :code, Room.id_to_code(room.id))}}
    end
  end

  def get_by_code(room_code) do
    with {:ok, room_id} <- Room.code_to_id(room_code) do
      room_q = preload(Room, [:creator, :users])
      case result = Repo.get(room_q, room_id) do
        %Room{} ->
          room = result
          |> Map.put(:code, room_code)
          {:ok, room}
        _ -> {:error, "Room #{room_code} not found"}
      end
    else
      _ -> {:error, "Invalid room code format"}
    end
  end

  def get_user_in_room(room_code, user_id) do
    with {:ok, room_id} <- Room.code_to_id(room_code) do
      query = from ru in RoomUser,
        join: r in assoc(ru, :room),
        where: r.id == ^room_id,
        where: ru.id == ^user_id
      result = query |> Repo.one()
      case result do
        %RoomUser{} -> {:ok, result}
        _ -> {:error, "Room user not found"}
      end
    else
      _ -> {:error, "Invalid room code format"}
    end
  end

  def join(room, name) do
    %RoomUser{}
    |> change(name: name, room: room)
    |> RoomUser.validations()
    |> Repo.insert()
  end

  def change_user_name(room_user, name) do
    room_user
    |> change(name: name)
    |> RoomUser.validations()
    |> Repo.update()
  end
end
