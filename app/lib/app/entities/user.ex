defmodule App.Entities.User do
  use Ecto.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{
    id: non_neg_integer,
    hashed_pw: String.t,
    role: String.t | nil,
    username: String.t,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "user" do
    field :hashed_pw, :string, redact: true
    field :role, :string
    field :username, :string, unique: true
    field :password, :string, virtual: true, redact: true

    timestamps()
  end

  @doc """
  A user changeset for registration. Adapted from https://github.com/elixircastsio/148-live-view-auth-pt-2
  """
  def changeset(user, attrs, opts \\ []) do
    user
    |> cast(attrs, [:username, :role, :password])
    |> validate_inclusion(:role, ["viewer"])
    |> validate_username()
    |> validate_password(opts)
  end

  defp validate_username(changeset) do
    changeset
    |> validate_required([:username])
    |> validate_length(:username, min: 2, max: 64)
    |> validate_format(:username, ~r/^[A-Za-z0-9-_.]+$/, message: "only letters, numbers, and the characters '-_.' are allowed")
    |> unique_constraint(:username)
  end

  defp validate_password(changeset, opts) do
    changeset
    |> validate_required([:password])
    |> validate_length(:password, min: 8, max: 72)
    |> maybe_hash_password(opts)
  end

  defp maybe_hash_password(changeset, opts) do
    password = get_change(changeset, :password)

    if Keyword.get(opts, :final?, true) and changeset.valid? and password do
      changeset
      |> put_change(:hashed_pw, Bcrypt.hash_pwd_salt(password))
      |> delete_change(:password)
    else
      changeset
    end
  end

  @spec verify_password(t, String.t) :: boolean
  @doc """
  Verifies the password.

  If there is no user or the user doesn't have a password, we call
  `Bcrypt.no_user_verify/0` to avoid timing attacks.
  """
  def verify_password(%App.Entities.User{hashed_pw: hashed_password}, password)
      when is_binary(hashed_password) and byte_size(password) > 0 do
    Bcrypt.verify_pass(password, hashed_password)
  end

  def verify_password(_, _) do
    Bcrypt.no_user_verify()
    false
  end
end
