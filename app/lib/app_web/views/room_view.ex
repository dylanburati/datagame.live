defmodule AppWeb.RoomView do
  use AppWeb, :view

  def render("room.json", %{room_user: room_user, room: room}) do
    %{
      roomId: room.code,
      createdAt: room.inserted_at,
      userId: room_user.id,
      displayName: room_user.name,
    }
  end
end
