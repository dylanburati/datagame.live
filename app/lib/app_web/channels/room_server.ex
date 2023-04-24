defmodule AppWeb.RoomServer do
  use GenServer

  alias App.Entities.Room
  alias AppWeb.RoomProcess

  # Starts the RoomServer
  def start_link(opts) do
    GenServer.start_link(__MODULE__, :ok, opts)
  end

  # Client API

  def join(room, entrance) do
    GenServer.call(__MODULE__, {:join, room, entrance})
  end

  def terminate(room_code) do
    GenServer.call(__MODULE__, {:terminate, room_code})
  end

  # Server API
  # based on https://hexdocs.pm/elixir/Task.Supervisor.html#async_nolink/3-examples

  @impl true
  def init(_init_arg) do
    {:ok, %{}}
  end

  @impl true
  def handle_call({:join, room, entrance}, _from, state) do
    room_code = Room.id_to_code(room.id)
    next_state = if Map.has_key?(state, room_code) do
      RoomProcess.update(room_code, entrance)
      state
    else
      # The task is not running yet, so let's start it.
      # The entrance event can also be sent locally, since we know the task is on this node.
      task = Task.Supervisor.async_nolink(
        AppWeb.RoomSupervisor,
        fn -> RoomProcess.run(room) end
      )
      send(task.pid, entrance)
      Map.put(state, room_code, task)
    end

    {:reply, :ok, next_state}
  end

  @impl true
  def handle_call({:terminate, room_code}, _from, state) do
    if task = Map.get(state, room_code) do
      Task.shutdown(task)
    end
    {:reply, :ok, state}
  end

  @impl true
  def handle_info({ref, answer}, state) do
    # The task completed successfully
    # We don't care about the DOWN message now, so let's demonitor and flush it
    Process.demonitor(ref, [:flush])
    room_code = get_room_code_by_ref(ref, state)
    IO.inspect({__MODULE__, :handle_info, ref, answer, room_code})
    {:noreply, Map.delete(state, room_code)}
  end

  @impl true
  def handle_info({:DOWN, ref, :process, _pid, reason}, state) do
    # The task failed
    room_code = get_room_code_by_ref(ref, state)
    IO.inspect({__MODULE__, :handle_info, :DOWN, ref, reason, room_code})
    {:noreply, Map.delete(state, room_code)}
  end

  defp get_room_code_by_ref(ref, state) do
    state
    |> Enum.find({nil, nil}, fn {_, task} -> task.ref == ref end)
    |> elem(0)
  end
end
