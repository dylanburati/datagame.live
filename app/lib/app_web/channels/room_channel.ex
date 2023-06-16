defmodule AppWeb.RoomChannel do
  use AppWeb, :channel

  alias AppWeb.RoomEntrance
  alias AppWeb.RoomMessage
  alias AppWeb.RoomProcess
  alias AppWeb.RoomServer
  alias App.Entities.RoomUser
  alias App.Entities.RoomService

  @api_version 4

  def api_version(), do: @api_version

  @impl true
  def join("room:" <> room_code, params = %{"version" => cl_version}, socket) do
    cond do
      cl_version != @api_version -> {:error, %{reason: "Please upgrade your app"}}
      not Map.has_key?(params, "displayName") -> {:error, %{reason: "Nickname is required"}}
      true -> join_impl(room_code, params, socket)
    end
  end

  @impl true
  def join(_room_code, _, _socket) do
    {:error, %{reason: "Please upgrade your app"}}
  end

  def join_impl(room_code, %{"userId" => user_id, "displayName" => name}, socket) do
    with {:ok, room_user} <- RoomService.get_user_in_room(room_code, user_id) do
      case RoomService.change_user_name(room_user, name) do
        {:ok, _} ->
          send(self(), :after_join)
          {:ok, assign(socket, user_id: user_id)}

        {:error, changeset} ->
          pair = {Keyword.get(changeset.errors, :name), Keyword.get(changeset.errors, :room_id)}
          case pair do
            {{reason, _}, _i} -> {:error, %{reason: "name #{reason}"}}
            {_n, {reason, _}} -> {:error, %{reason: "name #{reason}"}}
            {_, _} -> {:error, %{reason: "unknown error"}}
          end
      end
    else
      _ -> {:error, %{reason: "room user #{user_id} doesn't exist"}}
    end
  end

  def join_impl(room_code, %{"displayName" => name}, socket) do
    with {:ok, room} <- RoomService.get_by_code(room_code) do
      with {:ok, room_user} <- RoomService.join(room, name) do
        send(self(), :after_join)
        {:ok, assign(socket, user_id: room_user.id)}
      else
        _ -> {:error, %{reason: "name has already been taken"}}
      end
    else
      _ -> {:error, %{reason: "room #{room_code} doesn't exist"}}
    end
  end

  @impl true
  def handle_in(event, payload, socket) do
    if event in ["user:start", "round:start", "turn:feedback", "turn:end"] do
      message = %RoomMessage{
        channel_pid: self(),
        event: String.to_atom(event),
        payload: payload,
        reply_ref: socket_ref(socket)
      }
      RoomProcess.update(get_room_code(socket), message)
      {:noreply, socket}
    else
      {:reply, {:error, %{"reason" => "unknown message type: #{event}"}}, socket}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    %{user_id: user_id} = socket.assigns
    room_code = get_room_code(socket)

    with {:ok, room} <- RoomService.get_by_code(room_code),
         room_user <- Enum.find(room.users, fn %{id: id} -> id == user_id end),
         %RoomUser{} <- room_user do
      entrance = %RoomEntrance{
        channel_pid: self(),
        ref: psocket_ref(socket),
        user_id: user_id,
        display_name: room_user.name,
      }
      :ok = RoomServer.join(room, entrance)
      push(socket, "clock", %{timestamp: System.system_time(:millisecond)})
      {:noreply, socket}
    else
      _ -> {:noreply, socket}
    end
  end

  def handle_info({:push, dest_ref, event, payload}, socket) do
    push_to_ref(dest_ref, event, payload)
    {:noreply, socket}
  end

  def handle_info({:reply, dest_ref, {status, payload}}, socket) do
    reply(dest_ref, {status, payload})
    {:noreply, socket}
  end

  defp get_room_code(%{topic: "room:" <> code}), do: code

  # Like Channel.socket_ref/1, but leaves out the `socket.ref` component, as this is for pushes
  # rather than replies.
  defp psocket_ref(%Phoenix.Socket{joined: true} = socket) do
    {socket.transport_pid, socket.serializer, socket.topic, socket.join_ref}
  end

  defp psocket_ref(_socket) do
    raise ArgumentError, """
    socket refs can only be generated for a socket that has joined
    """
  end

  defp push_to_ref({transport_pid, serializer, topic, join_ref}, event, payload) do
    Phoenix.Channel.Server.push(transport_pid, join_ref, topic, event, payload, serializer)
  end
end
