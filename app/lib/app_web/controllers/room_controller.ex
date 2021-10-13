defmodule AppWeb.RoomController do
  use AppWeb, :controller

  alias App.Entities.RoomService

  def new_room(conn, _body) do
    case RoomService.create() do
      {:ok, %{room_user: room_user, room: room}} ->
        render(conn, "room.json", %{room_user: room_user, room: room})
      {:error, err} ->
        conn |> put_status(400) |> json(%{"error" => to_string(err)})
    end
  end
end
