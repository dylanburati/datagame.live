defmodule AppWeb.RoomChannel do
  use AppWeb, :channel

  import App.Utils, only: [find_last: 2]
  alias AppWeb.Presence
  alias AppWeb.TriviaView
  alias App.Entities.Party.PartyState
  alias App.Entities.RoomData
  alias App.Entities.RoomUser
  alias App.Entities.RoomService
  alias App.Entities.TriviaService

  @doc """
  Gets the current version of the Room client-server protocol
  """
  def version(), do: 3

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
      just_joined = %{"userId" => user_id, "displayName" => room_user.name}
      room_extras = %{"creatorId" => room.creator.id, "createdAt" => room.inserted_at}
      round_messages = TriviaView.round_messages(RoomData.get_room(room_code))
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

  @impl true
  def handle_info(:turn_start, socket) do
    %{room_code: room_code} = socket.assigns
    present_users = Presence.list(socket)
    |> Enum.map(fn {str, _} -> String.to_integer(str, 10) end)
    |> MapSet.new()

    with turn_uid when is_integer(turn_uid) <- RoomData.get_current_player_id(room_code),
         player_order when is_list(player_order) <- RoomData.get_player_order(room_code) do

      next_turn = RoomData.turn_id(room_code)
      other_user_id = player_order
      |> Enum.filter(fn uid -> uid != turn_uid end)
      |> Enum.filter(fn uid -> MapSet.member?(present_users, uid) end)
      |> Enum.shuffle()
      |> List.first()
      exclude_types = if is_nil(other_user_id), do: ["matchrank"], else: []
      past_def_ids = RoomData.player_trivia_def_ids(room_code, turn_uid)

      with {:ok, trivia_def, trivia} <- TriviaService.get_any_trivia(past_def_ids, not: exclude_types) do
        uid2 = case trivia_def.answer_type do
          "matchrank" -> other_user_id
          _ -> nil
        end
        msg = RoomData.init_turn(room_code, {turn_uid, uid2}, trivia, trivia_def.id)
        |> TriviaView.round_message("turn:start")

        broadcast(socket, "turn:start", msg)
        {:noreply, socket}
      else
        _ ->
          broadcast(socket, "turn:abort", %{"userId" => turn_uid, "turnId" => next_turn})
          {:noreply, socket}
      end
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
  def handle_in("round:start", %{"playerOrder" => participants}, socket) when is_list(participants) do
    %{room_code: room_code} = socket.assigns
    with {:empty?, false} <- {:empty?, Enum.empty?(participants)},
         {:ok, room} <- RoomService.get_by_code(room_code),
         all_users = MapSet.new(room.users, &Map.fetch!(&1, :id)),
         {:invalid_id, []} <- {:invalid_id, Enum.filter(participants, &(&1 not in all_users))} do
      msg = RoomData.init_round(room_code, participants)
      |> TriviaView.round_message("round:start")

      broadcast(socket, "round:start", msg)
      {:ok, _} = RoomData.request_turn(room_code, 0)
      send(self(), :turn_start)
      {:reply, {:ok, %{}}, socket}
    else
      {:empty?, _} -> {:reply, {:error, %{reason: "Player order can not be empty"}}, socket}
      {:invalid_id, lst} -> {:reply, {:error, %{reason: "Player order contains invalid user ids: #{lst}"}}, socket}
      _ -> {:reply, {:error, %{reason: "Room was deleted"}}, socket}
    end
  end

  @impl true
  def handle_in("round:start", _, socket) do
    {:reply, {:error, %{reason: "Player order is required"}}, socket}
  end

  @impl true
  def handle_in("turn:feedback", %{"answered" => answered}, socket) when is_list(answered) do
    %{room_code: room_code, user_id: user_id} = socket.assigns
    state = RoomData.update_answers(
      room_code, user_id, answered
    )
    %PartyState{answers: answers, turn_history: turn_history} = state
    {valid?, last_ans} = case find_last(turn_history, &(elem(&1, 0) in ["turn:start", "turn:end"])) do
      {"turn:start", %{trivia: %{answer_type: "matchrank"}}} -> {true, map_size(answers) >= 2}
      {"turn:start", _} -> {true, true}
      _ -> {false, false}
    end
    if valid? do
      if last_ans do
        msg = RoomData.end_turn(room_code)
        |> TriviaView.round_message("turn:feedback")
        broadcast(socket, "turn:feedback", msg)
      end
      {:reply, {:ok, %{}}, socket}
    else
      {:reply, {:error, %{reason: "Answers can not be submitted at this stage"}}, socket}
    end
  end

  @impl true
  def handle_in("turn:feedback", _, socket) do
    {:reply, {:error, %{reason: "Answer list is required"}}, socket}
  end

  @impl true
  def handle_in("turn:end", payload, socket) do
    %{room_code: room_code} = socket.assigns
    with %{"fromTurnId" => from_turn} <- payload,
         {:ok, _} <- RoomData.request_turn(room_code, from_turn) do
      send(self(), :turn_start)
      {:reply, {:ok, %{}}, socket}
    else
      ^payload -> {:reply, {:error, %{reason: "Previous turn number is required"}}, socket}
      {:noop, turn_id} ->
        {:reply,
         {:error, %{reason: "Previous turn number was #{turn_id}"}},
         socket}
      _ -> {:reply, {:error, %{reason: "Unknown error"}}, socket}
    end
  end
end
