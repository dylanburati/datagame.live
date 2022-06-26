defmodule App.Cache do
  use GenServer

  @never_expires 9223372036854775807

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, [], opts)
  end

  def new_atomic(key) do
    GenServer.call(__MODULE__, {:new_atomic, key})
  end

  def delete_atomic(key) do
    GenServer.call(__MODULE__, {:delete_atomic, key})
  end

  def fetch_atomic(key) do
    GenServer.call(__MODULE__, {:fetch_atomic, key})
  end

  def get_atomic(key, default \\ nil) do
    case GenServer.call(__MODULE__, {:fetch_atomic, key}) do
      {:ok, value} -> value
      :error -> default
    end
  end

  def set_atomic(key, value) do
    GenServer.call(__MODULE__, {:set_atomic, key, value})
  end

  def try_incr_atomic(key, exp_value) do
    GenServer.call(__MODULE__, {:try_incr_atomic, key, exp_value})
  end

  def lookup(key) do
    GenServer.call(__MODULE__, {:lookup, key})
  end

  def insert(key, value) do
    GenServer.call(__MODULE__, {:insert, key, @never_expires, value})
  end

  def insert_with_ttl(key, value, ttl) do
    expires = System.system_time(:microsecond) + floor(1000000 * ttl)
    GenServer.call(__MODULE__, {:insert, key, expires, value})
  end

  @type t_cache_val :: any
  @spec update(any, t_cache_val, ((t_cache_val) -> t_cache_val)) :: t_cache_val
  def update(key, default_val, updater) do
    GenServer.call(__MODULE__, {:update, key, default_val, updater})
  end

  @impl true
  def init(_) do
    :ets.new(:app_cache, [:set, :private, :named_table])
    {:ok, %{}}
  end

  @impl true
  def handle_call({:new_atomic, key}, _from, state) do
    {:reply, :ok, Map.put(state, key, :atomics.new(1, []))}
  end

  @impl true
  def handle_call({:delete_atomic, key}, _from, state) do
    {:reply, :ok, Map.delete(state, key)}
  end

  @impl true
  def handle_call({:fetch_atomic, key}, _from, state) do
    case Map.fetch(state, key) do
      {:ok, counter} ->
        {:reply, {:ok, :atomics.get(counter, 1)}, state}
      _ ->
        {:reply, :error, state}
    end
  end

  @impl true
  def handle_call({:set_atomic, key, value}, _from, state) do
    case Map.fetch(state, key) do
      {:ok, counter} ->
        {:reply, :atomics.put(counter, 1, value), state}
      _ ->
        {:reply, :error, state}
    end
  end

  @impl true
  def handle_call({:try_incr_atomic, key, exp_value}, _from, state) do
    case Map.fetch(state, key) do
      {:ok, counter} ->
        case :atomics.compare_exchange(counter, 1, exp_value, exp_value + 1) do
          :ok -> {:reply, {:ok, exp_value + 1}, state}
          actual_value -> {:reply, {:noop, actual_value}, state}
        end
      _ ->
        {:reply, :error, state}
    end
  end

  @impl true
  def handle_call({:lookup, key}, _from, state) do
    now = System.system_time(:microsecond)
    result = case :ets.lookup(:app_cache, key) do
      [{^key, exp_time, value}] when now < exp_time -> value
      _ -> nil
    end
    {:reply, result, state}
  end

  @impl true
  def handle_call({:insert, key, exp_time, value}, _from, state) do
    true = :ets.insert(:app_cache, {key, exp_time, value})
    {:reply, :ok, state}
  end

  @impl true
  def handle_call({:update, key, default_val, updater}, _from, state) do
    now = System.system_time(:microsecond)
    result = case :ets.lookup(:app_cache, key) do
      [{^key, exp_time, value}] when now < exp_time ->
        next_val = updater.(value)
        :ets.insert(:app_cache, {key, exp_time, next_val})
        next_val
      _ ->
        :ets.insert(:app_cache, {key, @never_expires, default_val})
        default_val
    end
    {:reply, result, state}
  end
end
