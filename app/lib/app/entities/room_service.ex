defmodule App.Entities.RoomService do
  import Ecto.Changeset
  import Ecto.Query
  import App.Utils

  alias App.Repo
  alias App.Entities.Room
  alias App.Entities.RoomUser

  def create() do
    creator_changeset = %RoomUser{}
    |> change(name: "host")
    |> RoomUser.validations()

    room_changeset = %Room{}
    |> change(code: alpha_code(4))
    |> Room.validations()

    Ecto.Multi.new
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
  end

  def get_by_code(room_code) do
    case result = Repo.get_by(Room, code: room_code) do
      %Room{} -> {:ok, result |> Repo.preload([:creator, :users])}
      _ -> {:error, "Room #{room_code} not found"}
    end
  end

  def get_user_in_room(room_id, user_id) do
    query = from ru in RoomUser,
      join: r in assoc(ru, :room),
      where: r.code == ^room_id,
      where: ru.id == ^user_id
    result = query |> Repo.one()
    case result do
      %RoomUser{} -> {:ok, result}
      _ -> {:error, "Room user not found"}
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
