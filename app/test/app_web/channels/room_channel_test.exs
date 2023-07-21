defmodule AppWeb.RoomChannelTest do
  use AppWeb.ChannelCase

  alias App.Entities.RoomService

  setup do
    {:ok, %{code: code}, %{id: user_id}} = RoomService.create("jeSuisL'Hôte")
    host_join = %{"version" => 4, "userId" => user_id, "displayName" => "jeSuisL'Hôte"}
    {:ok, _, socket} =
      AppWeb.UserSocket
      |> socket("1", %{user_id: user_id})
      |> subscribe_and_join(AppWeb.RoomChannel, "room:" <> code, host_join)

    guest_join = %{"version" => 4, "displayName" => "soyElInvitado"}
    {:ok, _, socket2} =
      AppWeb.UserSocket
      |> socket("2", %{})
      |> subscribe_and_join(AppWeb.RoomChannel, "room:" <> code, guest_join)

    %{socket: socket, socket2: socket2}
  end

  test "replies with unknown message type error", %{socket: socket} do
    ref = push socket, "baz", %{}
    assert_reply ref, :error, %{"reason" => "unknown message type: baz"}
  end

  # test "user:change fails on collision", %{socket: socket} do
  #   ref = push socket, "user:change", %{"displayName" => "soyElInvitado"}
  #   assert_reply ref, :error, %{reason: "name has already been taken"}
  # end

  # test "user:change broadcasts on success", %{socket: socket} do
  #   push socket, "user:change", %{"displayName" => "jeSuisL'Hôtesse"}
  #   user_id = socket.assigns[:user_id]
  #   assert_broadcast "user:change",
  #     %{"displayName" => "jeSuisL'Hôtesse", "userId" => ^user_id}
  # end
end
