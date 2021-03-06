defmodule App.CacheWarmer do
  use GenServer

  alias App.Entities.Pairing
  alias App.Entities.PairingService
  alias App.Repo

  def start_link(opts \\ []) do
    GenServer.start_link(__MODULE__, [], opts)
  end

  @impl true
  def init(_) do
    send(self(), :pairings)
    {:ok, %{}}
  end

  @impl true
  def handle_info(:pairings, state) do
    now = System.system_time(:microsecond)
    Repo.all(Pairing)
    |> Task.async_stream(fn p ->
      PairingService.candidates(p)
    end)
    |> Stream.run()
    t1 = System.system_time(:microsecond)
    IO.puts "Pairing cache warmer took #{(t1 - now) / 1000.0}ms"
    {:noreply, state}
  end
end
