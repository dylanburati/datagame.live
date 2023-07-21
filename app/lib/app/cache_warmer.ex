defmodule App.CacheWarmer do
  use GenServer

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, [], opts)
  end

  @impl true
  def init(_) do
    # send(self(), :pairings)
    {:ok, %{}}
  end
end
