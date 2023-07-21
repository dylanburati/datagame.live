defmodule AppWeb.RoomProcess do
  alias App.Entities.Room
  alias App.Entities.TriviaService
  alias AppWeb.RoomEntrance
  alias AppWeb.RoomMessage
  alias AppWeb.TriviaView

  require Logger

  def run(%Room{code: room_id, creator_id: creator_id, inserted_at: create_date}) do
    pubsub_server = App.PubSub
    :ok = Phoenix.PubSub.subscribe(pubsub_server, "__room:" <> room_id)
    {:ok, state_agent} = Agent.start_link(fn -> init_state(creator_id, create_date) end)
    loop(state_agent)
    Agent.stop(state_agent)
    :ok = Phoenix.PubSub.unsubscribe(pubsub_server, "__room:" <> room_id)
  end

  @spec update(String.t, any) :: :ok
  def update(room_id, message) do
    Phoenix.PubSub.broadcast(App.PubSub, "__room:" <> room_id, message)
  end

  # Room State API

  defp init_state(creator_id, created_at) do
    %{
      clients: [],
      creator_id: creator_id,
      created_at: created_at,
      game_participants: nil,
      turn_history: [],
      scores: %{},
    }
  end

  defp on_entrance(
        state_agent,
        %RoomEntrance{user_id: user_id, channel_pid: channel_pid} = entrance
      ) do
    Agent.get_and_update(state_agent, fn %{clients: clients} = state ->
      client = Map.merge(%{}, entrance)
      new_clients = List.keystore(clients, user_id, 0, {user_id, channel_pid, client})
      others_connected =
        new_clients
        |> Enum.filter(fn {uid, pid, _} -> pid != nil and uid != user_id end)
        |> Enum.map(&elem(&1, 2))

      {{client, others_connected}, Map.put(state, :clients, new_clients)}
    end)
  end

  defp on_exit(state_agent, channel_pid) do
    Agent.get_and_update(state_agent, fn %{clients: clients} = state ->
      {left, new_clients} = case List.keytake(clients, channel_pid, 1) do
        {{uid, _pid, obj}, others} ->
          new_obj = Map.take(obj, [:user_id, :display_name])
          {obj, [{uid, nil, new_obj} | others]}

        nil ->
          {nil, clients}
      end

      others_connected =
        new_clients
        |> Enum.filter(fn {_, pid, _} -> pid != nil end)
        |> Enum.map(&elem(&1, 2))

      {{left, others_connected}, Map.put(state, :clients, new_clients)}
    end)
  end

  defp list_clients_and_presence(state_agent) do
    Agent.get(state_agent, fn %{clients: clients} ->
      clients
      |> Enum.map(fn {_, pid, client} -> {client, pid != nil} end)
    end)
  end

  defp list_connected_participating_clients(state_agent) do
    Agent.get(state_agent, fn
      %{game_participants: nil} -> []
      %{clients: clients, game_participants: plst} ->
        clients
        |> Enum.filter(fn {uid, pid, _} -> pid != nil and uid in plst end)
        |> Enum.map(fn {_, _, client} -> client end)
    end)
  end

  defp get_client(state_agent, channel_pid) do
    Agent.get(state_agent, fn %{clients: clients} ->
      List.keyfind!(clients, channel_pid, 1)
      |> elem(2)
    end)
  end

  defp get_creator_id(state_agent) do
    Agent.get(state_agent, fn %{creator_id: creator_id} -> creator_id end)
  end

  defp get_create_date(state_agent) do
    Agent.get(state_agent, fn %{created_at: created_at} -> created_at end)
  end

  defp get_game_participants(state_agent) do
    Agent.get(state_agent, &Map.fetch!(&1, :game_participants))
  end

  defp set_game_participants(state_agent, game_participants) do
    Agent.update(state_agent, &Map.put(&1, :game_participants, game_participants))
  end

  defp get_turn_history(state_agent) do
    Agent.get(state_agent, &Map.fetch!(&1, :turn_history))
  end

  @turn_history_size 7
  defp update_turn_history(state_agent, turn_record) do
    Agent.update(state_agent, fn %{turn_history: turn_history} = state ->
      Map.put(state, :turn_history, Enum.take([turn_record | turn_history], @turn_history_size))
    end)
  end

  # Room Process API

  defp pull_event(timeout) do
    receive do
      %RoomEntrance{channel_pid: pid} = entrance ->
        Process.monitor(pid)
        entrance

      {:DOWN, _ref, :process, pid, _reason} ->
        {:del_client, pid}

      %RoomMessage{} = message ->
        message

    after
      timeout -> :timeout
    end
  end

  defp pull_event_and_apply(_state_agent, ms)
  when is_number(ms) and ms < 0, do: nil

  defp pull_event_and_apply(state_agent, ms) do
    start_time = System.system_time(:millisecond)
    evt = pull_event(ms)
    now = System.system_time(:millisecond)
    remaining = if ms == :infinity, do: ms, else: start_time + ms - now
    case evt do
      %RoomEntrance{} = entrance ->
        {client, others_connected} = on_entrance(state_agent, entrance)
        {{:join, client, others_connected}, remaining}

      {:del_client, pid} ->
        case on_exit(state_agent, pid) do
          nil ->
            Logger.warning("unknown client went down: #{pid}")
            pull_event_and_apply(state_agent, remaining)
          {client, others_connected} ->
            {{:leave, client, others_connected}, remaining}
        end

      %RoomMessage{channel_pid: pid, event: event, payload: payload, reply_ref: reply_ref} ->
        client = Map.put(get_client(state_agent, pid), :reply_ref, reply_ref)
        {{event, client, payload}, remaining}

      :timeout -> nil
    end
  end

  @spec stream(state_agent :: Agent.agent, timeout :: number() | :infinity) :: Enum.t
  defp stream(state_agent, timeout) do
    Stream.unfold(timeout, fn ms -> pull_event_and_apply(state_agent, ms) end)
  end

  defp push(%{channel_pid: pid, ref: sock_ref}, event, payload) do
    send(pid, {:push, sock_ref, event, payload})
  end

  defp reply(%{channel_pid: pid, reply_ref: sock_ref}, {status, payload}) do
    send(pid, {:reply, sock_ref, {status, payload}})
  end

  defp check(true, _client, _message), do: true
  defp check(false, client, message) do
    reply(client, {:error, %{reason: message}})
    false
  end

  defp accept_clients(state_agent) do
    creator_id = get_creator_id(state_agent)

    stream(state_agent, :infinity)
    |> Stream.filter(fn
      {:join, client, others_connected} ->
        payload = join_payload(state_agent, client)
        push(client, "join", payload)
        opayload = user_change_payload({client, true})
        Enum.each(others_connected, &push(&1, "user:change", opayload))
        false

      {:leave, client, others_connected} ->
        opayload = user_change_payload({client, false})
        Enum.each(others_connected, &push(&1, "user:change", opayload))
        false

      {:"round:start", client, _payload} ->
        check(client.user_id == creator_id, client, "Only the host can start the game")

      {event, client, _} ->
        check(false, client, "invalid message type for signup phase #{Atom.to_string(event)}")
    end)
    |> Enum.find(fn {_, client, _} ->
      reply(client, {:ok, %{}})
      true
    end)

    :ok
  end

  defp user_change_payload({client, is_present}) do
    %{
      userId: client.user_id,
      displayName: client.display_name,
      isPresent: is_present
    }
  end

  defp join_payload(state_agent, client, round_messages \\ []) do
    user_lst =
      list_clients_and_presence(state_agent)
      |> Enum.map(&user_change_payload/1)

    %{
      creatorId: get_creator_id(state_agent),
      createdAt: get_create_date(state_agent),
      userId: client.user_id,
      displayName: client.display_name,
      users: user_lst,
      roundMessages: round_messages
    }
  end

  @turn_start_timeout 40_000
  defp turn_start_payload(turn_id, trivia) do
    %{
      turnId: turn_id,
      trivia: TriviaView.trivia_json(trivia),
      durationMillis: @turn_start_timeout,
      deadline: System.system_time(:millisecond) + @turn_start_timeout,
    }
  end

  @turn_feedback_timeout 15_000
  defp turn_feedback_payload_partial(turn_id, current_scores, grade_map) do
    score_entries = Enum.map(current_scores, fn {k, v} ->
      turn_grade = Map.get(grade_map, k)
      v = if turn_grade == true, do: v + 1, else: v
      %{userId: k, score: v, turnGrade: turn_grade}
    end)

    %{
      turnId: turn_id,
      scores: score_entries,
    }
  end

  defp turn_feedback_payload_full(turn_id, current_scores, grade_map, answers_map, trivia, trivia_exps, opts \\ []) do
    answers_entries = Enum.map(answers_map, fn {k, v} -> %{userId: k, answered: v} end)
    result =
      turn_feedback_payload_partial(turn_id, current_scores, grade_map)
      |> Map.merge(%{
        answers: answers_entries,
        isFinal: Keyword.get(opts, :is_final, false),
        expectedAnswers: TriviaView.expected_answers_json(trivia_exps),
        durationMillis: @turn_feedback_timeout,
        deadline: System.system_time(:millisecond) + @turn_feedback_timeout,
      })
    case Map.get(trivia, :stats) do
      %{values: values, definition: stat_def} ->
        stats = %{
          values: values,
          definition: TriviaView.stat_def_json(stat_def)
        }
        Map.put(result, :stats, stats)

      _ -> result
    end
  end

  defp play_turn(state_agent, turn_id, current_scores) do
    past_def_ids = []  # TODO
    game_participants = get_game_participants(state_agent)

    with {:ok, trivia, trivia_exps} <- TriviaService.get_any_trivia(past_def_ids, not: ["matchrank"]) do
      st_payload = turn_start_payload(turn_id, trivia)
      IO.inspect({:st_payload, st_payload})
      score_payload = %{
        scores: Enum.map(current_scores, fn {k, v} -> %{userId: k, score: v} end)
      }
      round_messages = [
        Map.put(st_payload, :event, "turn:start"),
        Map.put(score_payload, :event, "round:scores"),
      ]

      list_connected_participating_clients(state_agent)
      |> Enum.each(&push(&1, "turn:start", st_payload))

      {grade_map, answers_map} =
        stream(state_agent, @turn_start_timeout)
        |> Enum.reduce_while({%{}, %{}}, fn
          {:join, client, others_connected}, acc ->
            {acc_grade_map, acc_answers_map} = acc
            fb_message = if Map.has_key?(acc_answers_map, client.user_id) do
              turn_feedback_payload_full(turn_id, current_scores, acc_grade_map, acc_answers_map, trivia, trivia_exps)
              |> Map.put(:event, "turn:feedback")
            else
              turn_feedback_payload_partial(turn_id, current_scores, acc_grade_map)
              |> Map.put(:event, "turn:progress")
            end
            payload = join_payload(state_agent, client, round_messages ++ [fb_message])
            push(client, "join", payload)
            if client.user_id in game_participants do
              opayload = user_change_payload({client, true})
              Enum.each(others_connected, &push(&1, "user:change", opayload))
            end
            {:cont, acc}

          {:leave, client, others_connected}, acc ->
            if client.user_id in game_participants do
              opayload = user_change_payload({client, false})
              Enum.each(others_connected, &push(&1, "user:change", opayload))
            end
            {:cont, acc}

          {:"turn:feedback", client, %{"turnId" => ans_turn_id, "answered" => answered}}, acc ->
            with true <- check(ans_turn_id == turn_id, client, "incorrect turn ID in message"),
                 true <- check(client.user_id in game_participants, client, "invalid message type for spectator"),
                 true <- check(is_list(answered), client, "invalid message content for type 'turn:feedback'"),
                 true <- check(Enum.all?(answered, &is_number/1), client, "invalid message content for type 'turn:feedback'")
            do
              {_, acc_answers_map} = acc
              reply(client, {:ok, %{}})
              acc_answers_map = Map.put(acc_answers_map, client.user_id, answered)
              acc_grade_map = TriviaService.grade_answers(trivia_exps, acc_answers_map)

              if map_size(acc_answers_map) >= length(game_participants) do
                {:halt, {acc_grade_map, acc_answers_map}}
              else
                uid = client.user_id
                list_connected_participating_clients(state_agent)
                |> Enum.each(fn
                  (c = %{user_id: ^uid}) ->
                    fb_payload = turn_feedback_payload_full(turn_id, current_scores, acc_grade_map, acc_answers_map, trivia, trivia_exps)
                    push(c, "turn:feedback", fb_payload)
                  c ->
                    fb_payload = turn_feedback_payload_partial(turn_id, current_scores, acc_grade_map)
                    push(c, "turn:progress", fb_payload)
                end)
                {:cont, {acc_grade_map, acc_answers_map}}
              end
            else
              _ -> {:cont, acc}
            end

          {:"turn:feedback", client, _}, acc ->
            check(false, client, "invalid message content for type 'turn:feedback'")
            {:cont, acc}

          {event, client, _}, acc ->
            check(false, client, "invalid message type for question phase #{Atom.to_string(event)}")
            {:cont, acc}
        end)

      score_map =
        grade_map
        |> Enum.filter(fn {_, correct?} -> correct? end)
        |> Map.new(fn {id, _} -> {id, 1} end)
        |> Map.merge(current_scores, fn _, v1, v2 -> v1 + v2 end)
      grade_map = Map.new(game_participants, fn k -> {k, Map.get(grade_map, k, false)} end)
      fb_payload = turn_feedback_payload_full(
        turn_id, current_scores, grade_map, answers_map, trivia, trivia_exps, is_final: true
      )
      round_messages = [
        Map.put(st_payload, :event, "turn:start"),
        Map.put(fb_payload, :event, "turn:feedback"),
      ]
      list_connected_participating_clients(state_agent)
      |> Enum.each(&push(&1, "turn:feedback", fb_payload))

      # End after 15s or after everyone hits "continue"
      stream(state_agent, @turn_feedback_timeout)
      |> Stream.filter(fn
        {:join, client, others_connected} ->
          payload = join_payload(state_agent, client, round_messages)
          push(client, "join", payload)
          if client.user_id in game_participants do
            opayload = user_change_payload({client, true})
            Enum.each(others_connected, &push(&1, "user:change", opayload))
          end
          false

        {:leave, client, others_connected} ->
          if client.user_id in game_participants do
            opayload = user_change_payload({client, false})
            Enum.each(others_connected, &push(&1, "user:change", opayload))
          end
          false

        {:"turn:end", client, %{"fromTurnId" => end_turn_id}} ->
          (check(end_turn_id == turn_id, client, "Incorrect turn ID in message")
            and check(client.user_id in game_participants, client, "Invalid message type for spectator"))

        {:"turn:end", client, _} ->
          check(false, client, "invalid message content for type 'turn:end'")

        {event, client, _} ->
          check(false, client, "invalid message type for question phase #{Atom.to_string(event)}")
      end)
      |> Enum.reduce_while(MapSet.new(), fn {_, client, _}, acc ->
        reply(client, {:ok, %{}})
        next_acc = MapSet.put(acc, client.user_id)
        if MapSet.size(next_acc) >= length(game_participants) do
          {:halt, next_acc}
        else
          {:cont, next_acc}
        end
      end)

      if map_size(answers_map) >= 1 do
        {:ok, score_map}
      else
        {:skip, "did not receive any answers"}
      end
    else
      _ -> {:skip, "failed to select trivia question"}
    end
  end

  @consecutive_skips_allowed 30
  @winning_score 1100
  defp loop(state_agent) do
    :ok = accept_clients(state_agent)
    game_participants =
      list_clients_and_presence(state_agent)
      |> Enum.map(fn {%{user_id: uid}, _} -> uid end)
    :ok = set_game_participants(state_agent, game_participants)

    score_map = Map.new(game_participants, fn k -> {k, 0} end)
    end_status = %{consec_skips: 0, scores: score_map}
    Stream.iterate(0, &(&1 + 1))
    |> Enum.reduce_while(end_status, fn turn_id, %{consec_skips: c, scores: s} ->
      case play_turn(state_agent, turn_id, s) do
        {:skip, reason} ->
          Logger.info("Skipped turn: #{reason}")
          next_acc = %{consec_skips: c + 1, scores: s}
          if next_acc.consec_skips >= @consecutive_skips_allowed do
            {:halt, next_acc}
          else
            {:cont, next_acc}
          end

        {:ok, score_map} ->
          next_acc = %{consec_skips: 0, scores: score_map}
          max_score = Map.values(score_map) |> Enum.max()
          if max_score >= @winning_score, do: {:halt, next_acc}, else: {:cont, next_acc}
      end
    end)
  end
end
