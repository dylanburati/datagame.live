defmodule AppWeb.RoomChannel do
  use AppWeb, :channel

  import App.Utils

  alias AppWeb.Presence
  alias AppWeb.TriviaView
  alias App.Entities.RoomUser
  alias App.Entities.RoomService
  alias App.Entities.TriviaService

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
      just_joined = %{"userId" => user_id, "displayName" => room_user.name}
      room_extras = %{"creatorId" => room.creator.id, "createdAt" => room.inserted_at}
      push(socket, "join", Map.merge(just_joined, room_extras))
      if is_new, do: broadcast(socket, "user:new", Map.put(just_joined, "isNow", true))

      ongoing_round = App.Cache.lookup("RoomChannel.round_start.#{room_id}")
      if not is_nil(ongoing_round) do
        turn_id = App.Cache.get_atomic("RoomChannel.turn_counter.#{room_id}", 0)
        push(socket, "round:start", Map.put(ongoing_round, "turnId", turn_id))
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
    :ok = App.Cache.new_atomic("RoomChannel.turn_counter.#{room_id}")
    :ok = App.Cache.set_atomic("RoomChannel.turn_counter.#{room_id}", 0)
    :ok = App.Cache.insert("RoomChannel.round_start.#{room_id}", payload)
    broadcast(socket, "round:start", Map.put(payload, "turnId", 0))
    {:reply, {:ok, %{}}, socket}
  end

  @impl true
  def handle_in("turn:start", payload, socket) do
    %{room_id: room_id, user_id: user_id} = socket.assigns
    cache_key = "RoomChannel.turn_counter.#{room_id}"
    with %{"fromTurnId" => from_turn} <- payload,
         next_turn = from_turn + 1,
         {:ok, ^next_turn} <- App.Cache.try_incr_atomic(cache_key, from_turn) do
      with {:ok, trivia_def, trivia} <- TriviaService.get_any_trivia() do
        trivia = %{
          "question" => trivia.question,
          "options" => Enum.map(trivia.options, &TriviaView.option_json/1),
          "answerType" => trivia_def.answer_type,
          "minAnswers" => trivia_def.selection_min_true,
          "maxAnswers" => trivia_def.selection_min_true,
        }
        |> maybe_put_lazy(Ecto.assoc_loaded?(trivia_def.option_stat_def), "statDef", fn ->
          case trivia_def.option_stat_def do
            %{label: label, stat_type: typ} -> %{"label" => label, "type" => typ}
            _ -> nil
          end
        end)
        turn_info = %{
          "userId" => user_id,
          "turnId" => next_turn,
          "trivia" => trivia,
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
  def handle_in("turn:end", _payload, socket) do
    %{user_id: user_id} = socket.assigns
    broadcast(socket, "turn:end", %{"userId" => user_id})
    {:reply, {:ok, %{}}, socket}
  end

  @impl true
  def handle_in("turn:feedback", payload, socket) do
    %{user_id: user_id, room_id: room_id} = socket.assigns
    turn_id = App.Cache.get_atomic("RoomChannel.turn_counter.#{room_id}", 0)
    broadcast(socket, "turn:feedback",
      Map.merge(payload, %{"userId" => user_id, "turnId" => turn_id}))
    {:reply, {:ok, %{}}, socket}
  end
end
