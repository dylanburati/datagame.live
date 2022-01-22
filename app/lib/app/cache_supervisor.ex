defmodule App.CacheSupervisor do
  use Supervisor

  def start_link(init_arg) do
    Supervisor.start_link(__MODULE__, init_arg, name: __MODULE__)
  end

  def init(_) do
    children = [
      {App.Cache, name: App.Cache},
      {App.CacheWarmer, name: App.CacheWarmer}
    ]

    Supervisor.init(children, strategy: :rest_for_one)
  end
end
