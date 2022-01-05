defmodule App.Repo.Migrations.CreatePairing do
  use Ecto.Migration

  def change do
    create table(:pairing) do
      add :name, :string, null: false
      add :criteria, :map, null: false
      add :deck_id, references(:deck, on_delete: :delete_all)

      timestamps()
    end

    create index(:pairing, [:deck_id])
    create unique_index(:pairing, [:deck_id, :name])
  end
end
