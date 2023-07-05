defmodule AppWeb.Router do
  use AppWeb, :router

  import AppWeb.UserAuth

  pipeline :browser do
    plug :accepts, ["html"]
    plug :fetch_session
    plug :fetch_live_flash
    plug :put_root_layout, {AppWeb.LayoutView, :root}
    plug :protect_from_forgery
    plug :put_secure_browser_headers
    plug :fetch_current_user
  end

  pipeline :api do
    plug :accepts, ["json"]
    plug :merge_resp_headers, [{"access-control-allow-origin", "*"}]
  end

  scope "/", AppWeb do
    pipe_through :browser

    get "/", PageController, :index
    get "/sheet", PageController, :sheet
    get "/sheet-advanced", PageController, :sheet_advanced
    get "/user/register", UserController, :new
    post "/user/register", UserController, :create
    get "/user/login", UserController, :login
    post "/user/login", UserController, :verify
    get "/user/logout", UserController, :logout

    live_session :default, on_mount: {AppWeb.LiveAuth, :assign_current_user} do
      live "/explore/:id", ExplorerLive, :index
    end

    live_session :admin, on_mount: {AppWeb.LiveAuth, :require_admin} do
      live "/sheet/:id", SheetLive, :index
    end
  end

  scope "/api", AppWeb do
    pipe_through :api

    resources "/sheets", SheetController, only: [:show, :create]
    resources "/decks", DeckController, only: [:index, :show]
    post "/deck/enhance/:id", DeckController, :update
    get "/game/new/:id", GameController, :new_game
    resources "/room", RoomController, only: [:create]
  end

  # Other scopes may use custom stacks.
  # scope "/api", AppWeb do
  #   pipe_through :api
  # end

  # Enables LiveDashboard only for development
  #
  # If you want to use the LiveDashboard in production, you should put
  # it behind authentication and allow only admins to access it.
  # If your application does not have an admins-only section yet,
  # you can use Plug.BasicAuth to set up some basic authentication
  # as long as you are also using SSL (which you should anyway).
  if Mix.env() in [:dev, :test] do
    import Phoenix.LiveDashboard.Router

    scope "/" do
      pipe_through :browser
      live_dashboard "/dashboard", metrics: AppWeb.Telemetry
    end
  end
end
