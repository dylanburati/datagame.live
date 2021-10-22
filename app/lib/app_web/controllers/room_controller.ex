defmodule AppWeb.RoomController do
  use AppWeb, :controller

  alias App.Entities.RoomService

  def create(conn, body) do
    with %{"hostNickname" => host_nickname} <- body do
      case RoomService.create(host_nickname) do
        {:ok, %{room_user: room_user, room: room}} ->
          render(conn, "room.json", %{room_user: room_user, room: room})
        {:error, :room_user, %{errors: errors}, _} ->
          error_out = case Keyword.get(errors, :name) do
            {msg, _} ->
              "Host nickname " <> msg
            _ ->
              "Unknown error"
          end
          conn |> put_status(400) |> json(%{"error" => error_out})
        _ ->
          conn |> put_status(400) |> json(%{"error" => "Unknown error creating room"})
      end
    else
      _ -> conn |> put_status(400) |> json(%{"error" => "Host nickname is required"})
    end
  end
end
