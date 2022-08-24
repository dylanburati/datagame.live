defmodule App.Entities.RoomData do
  import App.Utils
  alias App.Entities.RoomData

  defstruct [:room_code, :user_id]

  defmodule RoomCacheKeys do
    defstruct [:round_messages, :trivia, :scores, :turn_counter, :asked_def_ids]
  end

  # cache_keys(room_code,
  # ["round_start", "turn_counter", "last_player", "scores"])

  # cache_keys(room_code,
  # ["turn_counter", "curr_player", "turn_start", "turn_answers"])

  def current_room(socket) do
    with %{room_code: room_code, user_id: user_id} <- socket.assigns do
      %RoomData{room_code: room_code, user_id: user_id}
    end
  end

  @spec cache_keys(RoomData) :: RoomCacheKeys
  defp cache_keys(room_data) do
    %{room_code: room_code, user_id: user_id} = room_data
    %RoomCacheKeys{
      round_messages: "RoomChannel.#{room_code}.round_messages",
      trivia: "RoomChannel.#{room_code}.trivia",
      scores: "RoomChannel.#{room_code}.scores",
      turn_counter: "RoomChannel.#{room_code}.turn_counter",
      asked_def_ids: "RoomChannel.#{room_code}.#{user_id}.asked_def_ids"
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
    start_scores = Map.new(participants, fn id -> {id, 0} end)
    App.Cache.update(k.scores, start_scores, fn prev ->
      rng = Map.values(prev) |> Enum.min_max(fn -> :empty end)
      case rng do
        :empty -> start_scores
        {smin, smax} ->
          new_player_scores = Map.new(participants, fn id ->
            score = smin + floor(:rand.uniform() * (smax - smin))
            {id, score}
          end)
          Map.merge(new_player_scores, prev)
      end
    end)
    :ok
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
  Gets the player order of the active round.
  """
  @spec get_player_order(RoomData) :: [number]
  def get_player_order(room_data) do
    k = cache_keys(room_data)
    case App.Cache.lookup(k.round_messages) do
      nil -> []
      msgs -> case Enum.find(msgs, fn {evt, _} -> evt == "round:start" end) do
        {_, %{"playerOrder" => arr}} -> arr
        _ -> []
      end
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
    with {:ok, next_turn} <- App.Cache.try_incr_atomic(k.turn_counter, from_turn_id) do
      {:ok, next_turn}
    else
      e -> e
    end
  end

  @doc """
  Lists the most recent trivia def IDs encountered by the player.
  """
  @spec player_trivia_def_ids(RoomData) :: list(integer)
  def player_trivia_def_ids(room_data) do
    k = cache_keys(room_data)
    case App.Cache.lookup(k.asked_def_ids) do
      nil -> []
      lst -> lst
    end
  end

  @doc """
  Caches the content for the turn, and resets the answers to previous turns.
  """
  @spec init_turn(RoomData, integer, map, map, map) :: :ok
  def init_turn(room_data, turn_id, turn_info, trivia_def, trivia) do
    k = cache_keys(room_data)
    record = [{"turn:start", turn_info}]

    App.Cache.update(k.asked_def_ids, [trivia_def.id], fn prev -> Enum.take([trivia_def.id | prev], 7) end)
    App.Cache.insert(k.trivia, %{turn_id => {trivia_def, trivia}})
    # Keep the round:start and only 1 turn:end
    App.Cache.update(k.round_messages, record, fn msgs ->
      [find_last(msgs, &(elem(&1, 0) == "round:start")),
       find_last(msgs, &(elem(&1, 0) == "turn:end"))]
      |> Enum.filter(&(not is_nil(&1)))
      |> Enum.concat(record)
    end)
    :ok
  end

  @doc """
  Retreives the trivia for the current turn
  """
  @spec get_current_trivia(RoomData) :: {map, map} | nil
  def get_current_trivia(room_data) do
    trv_id = turn_id(room_data)
    k = cache_keys(room_data)
    case App.Cache.lookup(k.trivia) do
      %{^trv_id => pair} -> pair
      _ -> nil
    end
  end

  @doc """
  Sets the user's answer to the current turn question.
  """
  @spec update_answers(RoomData, map) :: Enumerable
  def update_answers(room_data, answered) do
    k = cache_keys(room_data)
    %{user_id: user_id} = room_data
    record = [{"turn:feedback", answered}]

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
    |> Enum.filter(fn {evt, _} -> evt == "turn:feedback" end)
    |> Enum.map(&(elem(&1, 1)))
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
      Enum.filter(msgs, &(elem(&1, 0) == "round:start"))
      |> Enum.concat(record)
    end)
    turn_info
  end
end
