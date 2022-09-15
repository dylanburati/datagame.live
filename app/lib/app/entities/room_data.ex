defmodule App.Entities.RoomData do
  import App.Utils
  alias App.Entities.RoomData
  alias App.Entities.TriviaService
  alias App.Entities.Party.PartyState

  # cache_keys(room_code,
  # ["round_start", "turn_counter", "last_player", "scores"])

  # cache_keys(room_code,
  # ["turn_counter", "curr_player", "turn_start", "turn_answers"])


  @doc """
  Begins a multiplayer game with the given participants.
  """
  @spec init_round(binary, list) :: PartyState
  def init_round(room_code, participants) do
    state = %PartyState{
      player_list: Enum.map(participants, &(%{id: &1, score: 0, trivia_def_ids: []})),
      turn_history: [],
      answers: %{}
    }
    :ok = App.Cache.new_atomic({room_code, :counter})
    App.Cache.insert({room_code, :state}, state)
    state
  end

  @doc """
  Gets the current turn ID.
  """
  @spec turn_id(binary) :: integer
  def turn_id(room_code) do
    App.Cache.get_atomic({room_code, :counter}, -1)
  end

  @doc """
  Gets the list of round messages required to reconstruct the game state.

  1. turn:end (scores, turnId)
  2. turn:start (trivia, turnId if no turn:end)
  """
  @spec get_room(binary) :: PartyState | nil
  def get_room(room_code) do
    App.Cache.lookup({room_code, :state})
  end

  @doc """
  Gets the player ID of the all players in the round-robin order.
  """
  @spec get_player_order(binary) :: [integer]
  def get_player_order(room_code) do
    with %{player_list: lst} <- get_room(room_code) do
      Enum.map(lst, &Map.fetch!(&1, :id))
    else
      _ -> []
    end
  end

  @doc """
  Gets the player ID of the next player in the round-robin order.
  """
  @spec get_current_player_id(binary) :: {integer, integer} | nil
  def get_current_player_id(room_code) do
    with %{player_list: lst, turn_history: history} <- get_room(room_code) do
      case find_last(history, {nil, nil}, fn {evt, _} -> evt in ["turn:start", "turn:end"] end) do
        {"turn:start", %{user_id: uid}} ->
          uid
        {"turn:end", %{user_id: uid}} ->
          index = Enum.find_index(lst, fn %{id: id} -> id == uid end) || -1
          Enum.at(lst, rem(index + 1, length(lst))) |> Map.get(:id)
        _ ->
          Enum.at(lst, 0) |> Map.get(:id)
      end
    else
      _ -> nil
    end
  end

  @doc """
  Starts the turn following `from_turn_id`, if it hasn't already been started.
  """
  @spec request_turn(RoomData, integer) :: {:ok, integer} | {:noop, integer} | :error
  def request_turn(room_code, from_turn_id) do
    App.Cache.try_incr_atomic({room_code, :counter}, from_turn_id)
  end

  @doc """
  Lists the most recent trivia def IDs encountered by the player.
  """
  @spec player_trivia_def_ids(binary, integer) :: [integer]
  def player_trivia_def_ids(room_code, user_id) do
    with %{player_list: lst} <- get_room(room_code),
         %{trivia_def_ids: def_ids} <- Enum.find(lst, fn %{id: id} -> id == user_id end) do
      def_ids
    else
      _ -> []
    end
  end

  @doc """
  Caches the content for the turn, and resets the answers to previous turns.
  """
  @spec init_turn(binary, {integer, integer | nil}, map, integer) :: PartyState
  def init_turn(room_code, {user_id, participant_id}, trivia, trivia_def_id) do
    turn_start_msg = %{
      user_id: user_id,
      turn_id: turn_id(room_code),
      trivia: trivia
    }
    |> maybe_put(not is_nil(participant_id), :participant_id, participant_id)

    # Keep only 1 turn:end
    App.Cache.update(
      {room_code, :state},
      nil,
      fn %PartyState{player_list: lst, turn_history: history} ->
        keep_msgs = Enum.filter(history, &(elem(&1, 0) == "turn:end"))
        |> take_right(1)
        |> Enum.concat([{"turn:start", turn_start_msg}])

        player_list = Enum.map(lst, fn user = %{id: uid, trivia_def_ids: prev} ->
          if uid in [user_id, participant_id] do
            Map.put(user, :trivia_def_ids, Enum.take([trivia_def_id | prev], 7))
          else
            user
          end
        end)
        %PartyState{
          player_list: player_list,
          turn_history: keep_msgs,
          answers: %{}
        }
      end
    )
  end

  @doc """
  Sets the user's answer to the current turn question.
  """
  @spec update_answers(binary, integer, map) :: PartyState
  def update_answers(room_code, user_id, answered) do
    # replace previous answer in log, if any
    App.Cache.replace!({room_code, :state}, fn state ->
      Map.put(state, :answers, Map.put(state.answers, user_id, answered))
    end)
  end

  @doc """
  Updates scores and logs that the player's turn is completed.
  """
  @spec end_turn(binary) :: PartyState
  def end_turn(room_code) do
    # Keep only 1 turn:start
    App.Cache.replace!(
      {room_code, :state},
      fn %PartyState{player_list: lst, turn_history: history, answers: answers} ->
        keep_msg = Enum.filter(history, &(elem(&1, 0) == "turn:start")) |> List.last()
        with {_, %{turn_id: turn_id, user_id: user_id, trivia: trivia}} <- keep_msg do
          score_changes = TriviaService.grade_answers(trivia, answers)
          |> Enum.filter(fn {_, correct?} -> correct? end)
          |> Map.new(fn {id, _} -> {id, 1} end)
          player_list = Enum.map(lst, fn user = %{id: uid} ->
            delta = Map.get(score_changes, uid, 0)
            Map.update(user, :score, delta, &(&1 + delta))
          end)
          %PartyState{
            player_list: player_list,
            turn_history: [keep_msg, {"turn:end", %{turn_id: turn_id, user_id: user_id}}],
            answers: answers
          }
        else
          _ -> raise "Turn history does not contain an ongoing turn"
        end
      end
    )
  end
end
