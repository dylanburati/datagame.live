defmodule AppWeb.UserController do
  use AppWeb, :controller
  alias App.Entities.User
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
        |> render("form.html", action: :create, changeset: changeset)
    end
  end

  def new(conn, _params) do
    render(conn, "form.html", action: :create, changeset: Ecto.Changeset.change(%User{}))
  end

  def verify(conn, %{"user" => user_params}) do
    case UserService.login(user_params) do
      {:ok, user} ->
        conn
        |> put_flash(:info, "Welcome back, #{user.username}")
        |> UserAuth.log_in_user(user)
        |> redirect(to: Routes.page_path(conn, :index))

      :error ->
        conn
        |> put_flash(:error, "Incorrect username or password.")
        |> render("form.html", action: :verify, changeset: Ecto.Changeset.change(%User{}))
    end
  end

  def login(conn, _params) do
    render(conn, "form.html", action: :verify, changeset: Ecto.Changeset.change(%User{}))
  end

  def logout(conn, _params) do
    UserAuth.log_out_user(conn)
  end
end
