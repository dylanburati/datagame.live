defmodule AppWeb.LiveAuth do
  import Phoenix.LiveView

  alias App.Entities.UserService
  alias AppWeb.Router.Helpers, as: Routes

  # Adapted from https://github.com/elixircastsio/148-live-view-auth-pt-2

  def on_mount(:assign_current_user, _, session, socket) do
    {:cont, assign_current_user(socket, session)}
  end

  def on_mount(:require_auth, _, session, socket) do
    require_user(socket, session)
  end

  def on_mount(:require_admin, _, session, socket) do
    require_user(socket, session, role: "admin")
  end

  defp require_user(socket, session, opts \\ []) do
    socket = assign_current_user(socket, session)
    if user = socket.assigns[:current_user] do
      case Keyword.get(opts, :role) do
        nil -> {:cont, socket}
        v when v == user.role -> {:cont, socket}
        _ ->
          {:halt,
           socket
           |> put_flash(:error, "You don't have clearance to access this page.")
           |> redirect(to: Routes.page_path(socket, :index))}
      end
    else
      {:halt,
        socket
        |> put_flash(:error, "You must log in to access this page.")
        |> redirect(to: Routes.page_path(socket, :index))}
    end
  end

  defp assign_current_user(socket, session) do
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
