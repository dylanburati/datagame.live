defmodule App.Repo.Migrations.CreateUser do
  use Ecto.Migration

  def change do
    create table(:user) do
      add :username, :string
      add :kind, :string
      add :hashed_pw, :string

      timestamps()
    end

    create unique_index(:user, [:username])
  end
end
