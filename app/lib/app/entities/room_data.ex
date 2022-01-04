defmodule App.Entities.RoomData do
  alias App.Entities.RoomData

  defstruct [:room_id, :user_id]

  # cache_keys(room_id,
  # ["round_start", "turn_counter", "last_player", "scores"])

  # cache_keys(room_id,
  # ["turn_counter", "curr_player", "turn_start", "turn_answers"])

  def current_room(socket) do
    with %{room_id: room_id, user_id: user_id} <- socket.assigns do
      %RoomData{room_id: room_id, user_id: user_id}
    end
  end

  defp cache_keys(room_data) do
    %{room_id: room_id} = room_data
    %{
      round_start: "RoomChannel.#{room_id}.round_start",
      scores: "RoomChannel.#{room_id}.scores",
      turn_counter: "RoomChannel.#{room_id}.turn_counter",
      turn_start: "RoomChannel.#{room_id}.turn_start",
      turn_answers: "RoomChannel.#{room_id}.turn_answers",
      curr_player: "RoomChannel.#{room_id}.curr_player",
      last_player: "RoomChannel.#{room_id}.last_player"
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
    :ok = App.Cache.insert(k.round_start, payload)
    participants = Map.get(payload, "playerOrder", [])
    App.Cache.insert(k.scores, Map.new(participants, fn id -> {id, 0} end))
  end

  @doc """
  Gets the round start payload, current turn ID, last player's ID, current player's ID,
  and scores.
  """
  @spec get_round(RoomData) :: nil | {map, integer, integer | nil, integer | nil, map}
  def get_round(room_data) do
    k = cache_keys(room_data)
    ongoing_round = App.Cache.lookup(k.round_start)
    if is_nil(ongoing_round) do
      nil
    else
      {
        ongoing_round,
        App.Cache.get_atomic(k.turn_counter, 0),
        App.Cache.lookup(k.last_player),
        App.Cache.lookup(k.curr_player),
        App.Cache.lookup(k.scores)
      }
    end
  end

  @doc """
  Gets the current turn ID.
  """
  @spec turn_id(RoomData) :: integer
  def turn_id(room_data) do
    case get_round(room_data) do
      {_, tid, _, _, _} -> tid
      _ -> 0
    end
  end

  @doc """
  Gets the current turn player's ID.
  """
  @spec curr_player_id(RoomData) :: integer | nil
  def curr_player_id(room_data) do
    case get_round(room_data) do
      {_, _, _, plid, _} -> plid
      _ -> nil
    end
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
    %{user_id: user_id} = room_data
    :ok = App.Cache.insert(k.curr_player, user_id)
    :ok = App.Cache.insert(k.turn_start, turn_info)
    App.Cache.insert(k.turn_answers, %{})
  end

  @doc """
  Gets the turn start payload and answer map.
  """
  @spec get_turn(RoomData) :: nil | {map, map}
  def get_turn(room_data) do
    k = cache_keys(room_data)
    ongoing_turn = App.Cache.lookup(k.turn_start)
    if is_nil(ongoing_turn) do
      nil
    else
      {
        ongoing_turn,
        App.Cache.lookup(k.turn_answers)
      }
    end
  end

  @doc """
  Sets the user's answer to the current turns question.
  """
  @spec update_answers(RoomData, map) :: map
  def update_answers(room_data, ans_info) do
    k = cache_keys(room_data)
    %{user_id: user_id} = room_data
    App.Cache.update(k.turn_answers, %{user_id => ans_info}, &(Map.put(&1, user_id, ans_info)))
  end

  @doc """
  Updates scores and logs that the player's turn is completed.
  """
  @spec end_turn(RoomData, map) :: :ok
  def end_turn(room_data, score_changes) do
    k = cache_keys(room_data)
    %{user_id: user_id} = room_data
    :ok = App.Cache.insert(k.last_player, user_id)
    if map_size(score_changes) > 0 do
      App.Cache.update(k.scores, %{}, fn map -> Map.merge(map, score_changes) end)
    end
    :ok
  end
end
