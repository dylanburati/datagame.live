defmodule App.Repo.Migrations.CreateRoom do
  use Ecto.Migration

  def change do
    create table(:room) do
      add :code, :string, null: false
      timestamps()
    end

    create unique_index(:room, [:code])
  end
end
