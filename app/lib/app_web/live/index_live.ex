defmodule AppWeb.IndexLive do
  alias AppWeb.LiveAuth
  alias AppWeb.UserAuth
  alias App.Entities.UserService
  alias App.Entities.User
  alias App.Entities.DeckService

  use AppWeb, :live_view
  # use Phoenix.LiveView

  def render(assigns) do
    render(AppWeb.PageView, "index.html", assigns)
  end

  def mount(_params, session, socket) do
    socket = socket
    |> LiveAuth.assign_current_user(session)
    |> assign(decks: DeckService.list(), changeset: Ecto.Changeset.change(%User{}))
    {:ok, socket}
  end

  def handle_event("validate", %{"user" => params}, socket) do
    IO.inspect {23, params}
    changeset = User.changeset(%User{}, params, final?: false)

    {:noreply, assign(socket, changeset: changeset)}
  end

  def handle_event("save", %{"user" => user_params}, socket) do
    IO.inspect {30, user_params}
    case UserService.create_user(user_params) do
      {:ok, user} ->
        {:noreply,
         socket
         |> put_flash(:info, "user created")
         |> UserAuth.log_in_user(user)}
        #  |> redirect(to: Routes.user_path(MyAppWeb.Endpoint, MyAppWeb.User.ShowView, user))}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, changeset: changeset)}
    end
  end
end
