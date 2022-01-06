defmodule App.Entities.RoomData do
  alias App.Entities.RoomData
  import App.Utils

  defstruct [:room_id, :user_id]

  defmodule RoomCacheKeys do
    defstruct [:round_messages, :scores, :turn_counter]
  end

  # cache_keys(room_id,
  # ["round_start", "turn_counter", "last_player", "scores"])

  # cache_keys(room_id,
  # ["turn_counter", "curr_player", "turn_start", "turn_answers"])

  def current_room(socket) do
    with %{room_id: room_id, user_id: user_id} <- socket.assigns do
      %RoomData{room_id: room_id, user_id: user_id}
    end
  end

  @spec cache_keys(RoomData) :: RoomCacheKeys
  defp cache_keys(room_data) do
    %{room_id: room_id} = room_data
    %RoomCacheKeys{
      round_messages: "RoomChannel.#{room_id}.round_messages",
      scores: "RoomChannel.#{room_id}.scores",
      turn_counter: "RoomChannel.#{room_id}.turn_counter"
    }
  end

  @doc """
  Begins a multiplayer game with the given participants.
  """
  @spec init_round(RoomData, map) :: :ok
  def init_round(room_data, payload) do
    k = cache_keys(room_data)
    :ok = App.Cache.new_atomic(k.turn_counter)
    :ok = App.Cache.set_atomic(k.turn_counter, 0)
    :ok = App.Cache.insert(k.round_messages, [{"round:start", payload}])
    participants = Map.get(payload, "playerOrder", [])
    App.Cache.insert(k.scores, Map.new(participants, fn id -> {id, 0} end))
  end

  @doc """
  Gets the list of round messages required to reconstruct the game state.

  1. round:start (player order, etc)
  2. turn:end (scores, turnId)
  3. turn:start (trivia, turnId if no turn:end)
  4. turn:feedback (one per answer submitted)
  """
  @spec get_round(RoomData) :: [map]
  def get_round(room_data) do
    k = cache_keys(room_data)
    case App.Cache.lookup(k.round_messages) do
      nil -> []
      msgs -> Enum.map(msgs, fn {evt, payload} -> Map.put(payload, "event", evt) end)
    end
  end

  @doc """
  Gets the current turn ID.
  """
  @spec turn_id(RoomData) :: integer
  def turn_id(room_data) do
    k = cache_keys(room_data)
    App.Cache.get_atomic(k.turn_counter, 0)
  end

  @doc """
  Starts the turn following `from_turn_id`, if it hasn't already been started.
  """
  @spec request_turn(RoomData, integer) :: {:ok, integer} | :error
  def request_turn(room_data, from_turn_id) do
    k = cache_keys(room_data)
    next_turn = from_turn_id + 1
    with {:ok, ^next_turn} <- App.Cache.try_incr_atomic(k.turn_counter, from_turn_id) do
      {:ok, next_turn}
    else
      _ -> :error
    end
  end

  @doc """
  Caches the content for the turn, and resets the answers to previous turns.
  """
  @spec init_turn(RoomData, map) :: :ok
  def init_turn(room_data, turn_info) do
    k = cache_keys(room_data)
    record = [{"turn:start", turn_info}]

    # Keep the round:start and only 1 turn:end
    App.Cache.update(k.round_messages, record, fn msgs ->
      [find_last(msgs, fn {evt, _} -> evt == "round:start" end),
       find_last(msgs, fn {evt, _} -> evt == "turn:end" end)]
      |> Enum.filter(&(not is_nil(&1)))
      |> Enum.concat(record)
    end)
    :ok
  end

  @doc """
  Sets the user's answer to the current turn question.
  """
  @spec update_answers(RoomData, map) :: map
  def update_answers(room_data, answered) do
    k = cache_keys(room_data)
    %{user_id: user_id} = room_data
    ans_info = Map.merge(answered, %{"userId" => user_id})
    record = [{"turn:feedback", ans_info}]

    # replace previous answer in log, if any
    App.Cache.update(k.round_messages, record, fn msgs ->
      Enum.filter(msgs, fn {evt, payload} ->
        cond do
          evt in ["round:start", "turn:start", "turn:end"] -> true
          evt == "turn:feedback" -> Map.get(payload, "userId") != user_id
          true -> false
        end
      end)
      |> Enum.concat(record)
    end)
    ans_info
  end

  @doc """
  Updates scores and logs that the player's turn is completed.
  """
  @spec end_turn(RoomData, map) :: :ok
  def end_turn(room_data, score_changes) do
    k = cache_keys(room_data)
    %{user_id: user_id} = room_data
    score_map = App.Cache.update(k.scores, %{}, fn map ->
      Map.merge(map, score_changes, fn _, prev, increment -> prev + increment end)
    end)
    score_lst = Enum.map(score_map, fn {k, v} -> %{"userId" => k, "score" => v} end)
    turn_info = %{"userId" => user_id, "turnId" => turn_id(room_data), "scores" => score_lst}
    record = [{"turn:end", turn_info}]

    App.Cache.update(k.round_messages, record, fn msgs ->
      Enum.filter(msgs, fn {evt, _} -> evt == "round:start" end)
      |> Enum.concat(record)
    end)
    turn_info
  end
end
