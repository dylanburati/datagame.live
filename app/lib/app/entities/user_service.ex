defmodule App.Entities.UserService do

  alias App.UserToken
  alias App.Entities.User
  alias App.Repo

  @spec create_user(map) :: {:ok, User.t} | {:error, Ecto.Changeset.t}
  @doc """
  Creates the user from the username, password, and role specified. These must be
  valid according to `App.Entities.User.changeset/2`.
  """
  def create_user(params) do
    User.changeset(%User{}, params)
    |> Repo.insert()
  end

  @spec login(map) :: {:ok, User.t} | :error
  @doc """
  Gets the user with the given username and verifies the given password.
  """
  def login(%{"username" => username, "password" => pw}) do
    user = Repo.get_by(User, username: username)
    if User.verify_password(user, pw) do
      {:ok, user}
    else
      :error
    end
  end

  def login(_), do: :error

  @spec get_by_token(any) :: User.t | nil
  @doc """
  Retrieves the user for the JWT, or returns nil if not found.
  """
  def get_by_token(token) when is_binary(token) do
    case UserToken.verify_and_validate(token) do
      {:ok, %{"sub" => id}} -> Repo.get(User, id)
      _ -> nil
    end
  end

  def get_by_token(_), do: nil
end
