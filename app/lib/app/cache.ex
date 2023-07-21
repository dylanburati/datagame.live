defmodule App.Cache do
  use GenServer

  @never_expires 9223372036854775807

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, [], opts)
  end

  @spec lookup(any) :: any | nil
  def lookup(key) do
    GenServer.call(__MODULE__, {:lookup, key})
  end

  @spec insert(any, any) :: :ok
  def insert(key, value) do
    GenServer.call(__MODULE__, {:insert, key, @never_expires, value})
  end

  @spec insert_with_ttl(any, any, number) :: :ok
  def insert_with_ttl(key, value, ttl) do
    expires = System.system_time(:microsecond) + floor(1000000 * ttl)
    GenServer.call(__MODULE__, {:insert, key, expires, value})
  end

  @spec update(any, ({:ok, cache_val} | :error -> cache_val)) :: cache_val when cache_val: var
  def update(key, updater) do
    GenServer.call(__MODULE__, {:update, key, updater})
  end

  @spec replace!(any, (cache_val -> cache_val)) :: cache_val when cache_val: var
  def replace!(key, replacer) do
    GenServer.call(__MODULE__, {:update, key, fn
      {:ok, val} -> replacer.(val)
      :error -> raise "Cache doesn't contain key: #{inspect(key)}"
    end})
  end

  @spec m_lookup(any) :: any | nil
  def m_lookup(key) do
    GenServer.call(__MODULE__, {:m_lookup, key})
  end

  @spec m_insert(any, cache_val) :: cache_val when cache_val: var
  def m_insert(key, value) do
    GenServer.call(__MODULE__, {:m_insert, key, value})
  end

  @spec m_update(any, ({:ok, cache_val} | :error -> cache_val)) :: cache_val when cache_val: var
  def m_update(key, updater) do
    GenServer.call(__MODULE__, {:m_update, key, updater})
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
  def handle_call({:update, key, updater}, _from, state) do
    now = System.system_time(:microsecond)
    result = case :ets.lookup(:app_cache, key) do
      [{^key, exp_time, value}] when now < exp_time ->
        next_val = updater.({:ok, value})
        :ets.insert(:app_cache, {key, exp_time, next_val})
        next_val
      _ ->
        default_val = updater.(:error)
        :ets.insert(:app_cache, {key, @never_expires, default_val})
        default_val
    end
    {:reply, result, state}
  end

  @impl true
  def handle_call({:m_lookup, key}, _from, state) do
    {:reply, Map.get(state, key), state}
  end

  @impl true
  def handle_call({:m_insert, key, value}, _from, state) do
    {:reply, value, Map.put(state, key, value)}
  end

  @impl true
  def handle_call({:m_update, key, updater}, _from, state) do
    value = Map.fetch(state, key) |> updater.()
    {:reply, value, Map.put(state, key, value)}
  end
end
