defmodule AppWeb.UserController do
  use AppWeb, :controller
  alias App.Entities.UserService
  alias AppWeb.UserAuth

  def create(conn, %{"user" => user_params}) do
    case UserService.create_user(user_params) do
      {:ok, user} ->
        conn
        |> put_flash(:info, "User created successfully.")
        |> UserAuth.log_in_user(user)

      {:error, %Ecto.Changeset{} = changeset} ->
        conn
        |> put_view(AppWeb.PageView)
        |> render("index.html", changeset: changeset)
    end
  end
end
