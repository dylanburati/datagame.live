defmodule AppWeb.RoomChannel do
  use AppWeb, :channel
  alias App.Entities.RoomService
  alias App.Entities.RoomUser

  def join("room:" <> room_id, %{"userId" => user_id, "displayName" => name}, socket) do
    with {:ok, room_user} <- RoomService.get_user_in_room(room_id, user_id) do
      case RoomService.change_user_name(room_user, name) do
        {:ok, _} ->
          send(self(), :after_join)
          {:ok, assign(socket, user_id: user_id, room_id: room_id, is_new: false)}

        {:error, changeset} ->
          pair = {Keyword.get(changeset.errors, :name), Keyword.get(changeset.errors, :room_id)}
          case pair do
            {{reason, _}, _i} -> {:error, %{reason: "name #{reason}"}}
            {_n, {reason, _}} -> {:error, %{reason: "name #{reason}"}}
            {_, _} -> {:error, %{reason: "unknown error"}}
          end
        _ -> {:error, %{reason: "unknown error"}}
      end
    else
      _ -> {:error, %{reason: "room user #{user_id} doesn't exist"}}
    end
  end

  def join("room:" <> room_id, %{"displayName" => name}, socket) do
    with {:ok, room} <- RoomService.get_by_code(room_id) do
      with {:ok, room_user} <- RoomService.join(room, name) do
        send(self(), :after_join)
        {:ok, assign(socket, user_id: room_user.id, room_id: room_id, is_new: true)}
      else
        _ -> {:error, %{reason: "name has already been taken"}}
      end
    else
      _ -> {:error, %{reason: "room #{room_id} doesn't exist"}}
    end
  end

  @impl true
  def join(_room_id, _, _socket) do
    {:error, %{reason: "name required"}}
  end

  @impl true
  def handle_info(:after_join, socket) do
    %{room_id: room_id, user_id: user_id, is_new: is_new} = socket.assigns
    with {:ok, room} <- RoomService.get_by_code(room_id),
         room_user <- Enum.find(room.users, fn %{id: id} -> id == user_id end),
         %RoomUser{} <- room_user do
      just_joined = %{"userId" => user_id, "displayName" => room_user.name}
      push(socket, "join", Map.put(just_joined, "creatorId", room.creator.id))
      if is_new, do: broadcast(socket, "user:new", just_joined)

      # send the details of every other user in the room
      Enum.filter(room.users, fn %{id: id} -> id != user_id end)
      |> Enum.map(fn %{id: id, name: name} ->
        %{"userId" => id, "displayName" => name}
      end)
      |> Enum.each(&(push(socket, "user:new", &1)))
      {:noreply, socket}
    else
      _ -> {:noreply, socket}
    end
  end

  # Channels can be used in a request/response fashion
  # by sending replies to requests from the client
  @impl true
  def handle_in("ping", payload, socket) do
    {:reply, {:ok, payload}, socket}
  end

  @impl true
  def handle_in("user:change", payload, socket) do
    %{room_id: room_id, user_id: user_id} = socket.assigns
    with %{"displayName" => name} <- payload do
      with {:ok, room_user} <- RoomService.get_user_in_room(room_id, user_id),
           {:ok, _} <- RoomService.change_user_name(room_user, name) do
        broadcast(socket, "user:change", %{"userId" => user_id, "displayName" => name})
      else
        {:error, changeset} ->
          pair = {Keyword.get(changeset.errors, :name), Keyword.get(changeset.errors, :room_id)}
          case pair do
            {{reason, _}, _i} -> {:reply, {:error, %{reason: "name #{reason}"}}, socket}
            {_n, {reason, _}} -> {:reply, {:error, %{reason: "name #{reason}"}}, socket}
            {_, _} -> {:reply, {:error, %{reason: "unknown error"}}, socket}
          end
        _ ->
          {:reply, {:error, %{reason: "unknown error"}}, socket}
      end
    else
      _ -> {:reply, {:error, %{reason: "display name is required"}}, socket}
    end
  end
end
