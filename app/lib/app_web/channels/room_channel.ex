defmodule AppWeb.RoomChannel do
  use AppWeb, :channel

  import App.Utils

  alias AppWeb.Presence
  alias AppWeb.TriviaView
  alias App.Entities.RoomUser
  alias App.Entities.RoomService
  alias App.Entities.TriviaService

  defp cache_keys(room_id, subkeys) do
    Enum.map(subkeys, fn sk -> "RoomChannel.#{room_id}" <> sk end)
  end

  defp cache_key(room_id, subkey), do: List.first(cache_keys(room_id, [subkey]))

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
    {:ok, _} = Presence.track(socket, user_id, %{online_at: 0})
    with {:ok, room} <- RoomService.get_by_code(room_id),
         room_user <- Enum.find(room.users, fn %{id: id} -> id == user_id end),
         %RoomUser{} <- room_user do
      [k_ongoing_round, k_turn_counter, k_last_player, k_scores] = cache_keys(room_id,
        ["round_start", "turn_counter", "last_player", "scores"])

      just_joined = %{"userId" => user_id, "displayName" => room_user.name}
      room_extras = %{"creatorId" => room.creator.id, "createdAt" => room.inserted_at}
      push(socket, "join", Map.merge(just_joined, room_extras))
      if is_new, do: broadcast(socket, "user:new", Map.put(just_joined, "isNow", true))

      ongoing_round = App.Cache.lookup(k_ongoing_round)
      scores = App.Cache.lookup(k_scores)
      if not is_nil(ongoing_round) do
        turn_id = App.Cache.get_atomic(k_turn_counter, 0)
        last_player = App.Cache.lookup(k_last_player)
        scores_out = case scores do
          nil -> nil
          map -> Enum.map(map, fn {k, v} -> %{"userId" => k, "score" => v} end)
        end
        push(socket, "round:start", Map.merge(ongoing_round,
          %{"turnId" => turn_id, "lastTurnUserId" => last_player, "scores" => scores_out}))
      end

      # send the details of every other user in the room
      Enum.filter(room.users, fn %{id: id} -> id != user_id end)
      |> Enum.map(fn %{id: id, name: name} ->
        %{"userId" => id, "displayName" => name, "isNow" => false}
      end)
      |> Enum.each(&(push(socket, "user:new", &1)))

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
    %{room_id: room_id, user_id: user_id} = socket.assigns
    with %{"displayName" => name} <- payload do
      with {:ok, room_user} <- RoomService.get_user_in_room(room_id, user_id),
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
    %{room_id: room_id} = socket.assigns
    [k_turn_counter, k_round_start, k_scores] = cache_keys(room_id,
      ["turn_counter", "round_start", "scores"])
    :ok = App.Cache.new_atomic(k_turn_counter)
    :ok = App.Cache.set_atomic(k_turn_counter, 0)
    :ok = App.Cache.insert(k_round_start, payload)
    participants = Map.get(payload, "playerOrder", [])
    :ok = App.Cache.insert(k_scores, Map.new(participants, fn id -> {id, 0} end))
    broadcast(socket, "round:start", Map.put(payload, "turnId", 0))
    {:reply, {:ok, %{}}, socket}
  end

  @impl true
  def handle_in("turn:start", payload, socket) do
    %{room_id: room_id, user_id: user_id} = socket.assigns
    k_turn_counter = cache_key(room_id, "turn_counter")
    with %{"fromTurnId" => from_turn} <- payload,
         next_turn = from_turn + 1,
         {:ok, ^next_turn} <- App.Cache.try_incr_atomic(k_turn_counter, from_turn) do
      with {:ok, trivia_def, trivia} <- TriviaService.get_any_trivia() do
        trivia_out = TriviaView.trivia_json(trivia_def, trivia)
        turn_info = %{
          "userId" => user_id,
          "turnId" => next_turn,
          "trivia" => trivia_out,
        }
        broadcast(socket, "turn:start", turn_info)
        {:reply, {:ok, %{}}, socket}
      else
        {:error, reason} -> {:reply, {:error, %{reason: reason}}, socket}
        _ -> {:reply, {:error, %{reason: "Unknown error"}}, socket}
      end
    else
      ^payload -> {:reply, {:error, %{reason: "Previous turn number is required"}}, socket}
      {:ok, turn_id} ->
        {:reply,
         {:error, %{reason: "Previous turn number was #{turn_id}"}},
         socket}
      _ -> {:reply, {:error, %{reason: "Unknown error"}}, socket}
    end
  end

  @impl true
  def handle_in("turn:end", payload, socket) do
    %{user_id: user_id, room_id: room_id} = socket.assigns
    [k_scores, k_last_player] = cache_keys(room_id, ["scores", "last_player"])

    App.Cache.insert(k_last_player, user_id)
    score_changes = Map.get(payload, "scoreChanges", [])
    |> Enum.filter(&(Map.has_key?(&1, "userId") and Map.has_key?(&1, "score")))
    |> Map.new(fn %{"userId" => k, "score" => v} -> {k, v} end)
    if map_size(score_changes) > 0 do
      App.Cache.update(k_scores, %{}, fn map -> Map.merge(map, score_changes) end)
    end
    broadcast(socket, "turn:end", Map.merge(payload, %{"userId" => user_id}))
    {:reply, {:ok, %{}}, socket}
  end

  @impl true
  def handle_in("turn:feedback", payload, socket) do
    %{user_id: user_id, room_id: room_id} = socket.assigns
    k_turn_counter = cache_key(room_id, "turn_counter")
    turn_id = App.Cache.get_atomic(k_turn_counter, 0)
    broadcast(socket, "turn:feedback",
      Map.merge(payload, %{"userId" => user_id, "turnId" => turn_id}))
    {:reply, {:ok, %{}}, socket}
  end
end
