defmodule App.Entities.UserService do

  import Ecto.Changeset
  alias App.Entities.User
  alias App.Repo

  def create_user(params) do
    # Create a user struct:
    user_changeset =
      %User{}
      |> cast(params, [:username, :password])
      |> validate_required([:username, :password])
      |> validate_format(:username, ~r/[a-zA-Z0-9._]{2,}/)
      |> validate_format(:password, ~r/.{8,}/)
      |> change(%{kind: "login"})

    user_changeset =
      case user_changeset.valid? do
        true -> change(user_changeset, Bcrypt.add_hash(params.password, hash_key: :hashed_pw))
        false -> user_changeset
      end
    Repo.insert(user_changeset)
  end

end
