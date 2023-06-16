defmodule App.Entities.User do
  use Ecto.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{
    id: non_neg_integer,
    hashed_pw: String.t,
    kind: String.t,
    username: String.t,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "user" do
    field :hashed_pw, :string, redact: true
    field :kind, :string
    field :username, :string, unique: true
    field :password, :string, virtual: true

    timestamps()
  end

  @doc false
  def changeset(user, attrs) do
    user
    |> cast(attrs, [:username, :kind, :hashed_pw])
    |> validate_required([:username, :kind, :hashed_pw])
  end
end
