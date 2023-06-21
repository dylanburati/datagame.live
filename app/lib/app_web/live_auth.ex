defmodule AppWeb.LiveAuth do
  import Phoenix.LiveView

  alias App.Entities.User
  alias App.Entities.UserService
  alias AppWeb.Router.Helpers, as: Routes

  # Adapted from https://github.com/elixircastsio/148-live-view-auth-pt-2

  def on_mount(:require_authenticated_user, _, session, socket) do
    socket = assign_current_user(socket, session)
    case socket.assigns.current_user do
      nil ->
        {:halt,
          socket
          |> put_flash(:error, "You must log in to access this page.")
          |> redirect(to: Routes.live_path(socket, AppWeb.IndexLive))}

      %User{} ->
        {:cont, socket}

    end
  end

  def assign_current_user(socket, session) do
    case session do
      %{"user_token" => user_token} ->
        assign_new(socket, :current_user, fn ->
          UserService.get_by_token(user_token)
        end)

      %{} ->
        assign_new(socket, :current_user, fn -> nil end)

    end
  end
end
