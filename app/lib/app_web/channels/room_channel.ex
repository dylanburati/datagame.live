defmodule AppWeb.RoomChannel do
  use AppWeb, :channel

  alias AppWeb.Presence
  alias AppWeb.TriviaView
  alias App.Entities.RoomData
  alias App.Entities.RoomUser
  alias App.Entities.RoomService
  alias App.Entities.TriviaService

  @doc """
  Gets the current version of the Room client-server protocol
  """
  def version(), do: 2

  @impl true
  def join("room:" <> room_code, params = %{"version" => cl_version}, socket) do
    cond do
      cl_version != version() -> {:error, %{reason: "Please upgrade your app"}}
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
          {:ok, assign(socket, user_id: user_id, room_code: room_code, is_new: false)}

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

  def join_impl(room_code, %{"displayName" => name}, socket) do
    with {:ok, room} <- RoomService.get_by_code(room_code) do
      with {:ok, room_user} <- RoomService.join(room, name) do
        send(self(), :after_join)
        {:ok, assign(socket, user_id: room_user.id, room_code: room_code, is_new: true)}
      else
        _ -> {:error, %{reason: "name has already been taken"}}
      end
    else
      _ -> {:error, %{reason: "room #{room_code} doesn't exist"}}
    end
  end

  @impl true
  def handle_info(:after_join, socket) do
    %{room_code: room_code, user_id: user_id, is_new: is_new} = socket.assigns
    {:ok, _} = Presence.track(socket, user_id, %{online_at: 0})
    with {:ok, room} <- RoomService.get_by_code(room_code),
         room_user <- Enum.find(room.users, fn %{id: id} -> id == user_id end),
         %RoomUser{} <- room_user do
      room_data = RoomData.current_room(socket)

      just_joined = %{"userId" => user_id, "displayName" => room_user.name}
      room_extras = %{"creatorId" => room.creator.id, "createdAt" => room.inserted_at}
      round_messages = RoomData.get_round(room_data)
      users = Enum.filter(room.users, fn %{id: id} -> id != user_id end)
      |> Enum.map(fn %{id: id, name: name} ->
        %{"userId" => id, "displayName" => name}
      end)

      join_info = just_joined
      |> Map.merge(room_extras)
      |> Map.merge(%{"roundMessages" => round_messages, "users" => users})
      push(socket, "join", join_info)
      if is_new, do: broadcast(socket, "user:new", Map.put(just_joined, "isNow", true))

      push(socket, "presence_state", Presence.list(socket))
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
    %{room_code: room_code, user_id: user_id} = socket.assigns
    with %{"displayName" => name} <- payload do
      with {:ok, room_user} <- RoomService.get_user_in_room(room_code, user_id),
           {:ok, _} <- RoomService.change_user_name(room_user, name) do
        broadcast(socket, "user:change", %{"userId" => user_id, "displayName" => name})
        {:reply, {:ok, %{}}, socket}
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

  @impl true
  def handle_in("round:start", payload, socket) do
    :ok = RoomData.current_room(socket) |> RoomData.init_round(payload)
    broadcast(socket, "round:start", Map.put(payload, "turnId", 0))
    {:reply, {:ok, %{}}, socket}
  end

  @impl true
  def handle_in("turn:start", payload, socket) do
    room_data = RoomData.current_room(socket)
    with %{"fromTurnId" => from_turn} <- payload,
         {:ok, next_turn} <- RoomData.request_turn(room_data, from_turn) do
      present_users = Presence.list(socket)
      |> Enum.map(fn {str, _} -> String.to_integer(str, 10) end)
      |> MapSet.new()
      other_user_id = RoomData.get_player_order(room_data)
      |> Enum.filter(fn uid -> uid != room_data.user_id end)
      |> Enum.filter(fn uid -> MapSet.member?(present_users, uid) end)
      |> Enum.shuffle()
      |> List.first()
      exclude_types = if is_nil(other_user_id), do: ["matchrank"], else: []
      past_def_ids = RoomData.player_trivia_def_ids(room_data)

      with {:ok, trivia_def, trivia} <- TriviaService.get_any_trivia(past_def_ids, not: exclude_types) do
        trivia_out = TriviaView.trivia_json(trivia_def, trivia)
        turn_info = %{
          "userId" => room_data.user_id,
          "turnId" => next_turn,
          "trivia" => trivia_out,
        }
        turn_info = case trivia_def.answer_type do
          "matchrank" -> Map.put(turn_info, "participantId", other_user_id)
          _ -> turn_info
        end
        :ok = RoomData.init_turn(room_data, trivia_def.id, turn_info)
        broadcast(socket, "turn:start", turn_info)
        {:reply, {:ok, %{}}, socket}
      else
        obj ->
          reason = case obj do
            {:error, x} -> x
            _ -> "Unknown error"
          end
          broadcast(socket, "turn:abort", %{"userId" => room_data.user_id, "turnId" => next_turn})
          {:reply, {:error, %{reason: reason}}, socket}
      end
    else
      ^payload -> {:reply, {:error, %{reason: "Previous turn number is required"}}, socket}
      {:noop, turn_id} ->
        {:reply,
         {:error, %{reason: "Previous turn number was #{turn_id}"}},
         socket}
      _ -> {:reply, {:error, %{reason: "Unknown error"}}, socket}
    end
  end

  @impl true
  def handle_in("turn:feedback", payload, socket) do
    room_data = RoomData.current_room(socket)
    ans_info = RoomData.update_answers(room_data, payload)
    broadcast(socket, "turn:feedback", ans_info)
    {:reply, {:ok, %{}}, socket}
  end

  @impl true
  def handle_in("turn:end", payload, socket) do
    score_changes = Map.get(payload, "scoreChanges", [])
    |> Enum.filter(&(Map.has_key?(&1, "userId") and Map.has_key?(&1, "score")))
    |> Map.new(fn %{"userId" => k, "score" => v} -> {k, v} end)

    room_data = RoomData.current_room(socket)
    turn_info = RoomData.end_turn(room_data, score_changes)
    broadcast(socket, "turn:end", turn_info)
    {:reply, {:ok, %{}}, socket}
  end
end
