defmodule App.Repo.Migrations.CreateCardStatDef do
  use Ecto.Migration

  def change do
    create table(:card_stat_def) do
      add :key, :string, null: false
      add :label, :string, null: false
      add :stat_type, :string, null: false
      add :deck_id, references(:deck, on_delete: :nothing)

      timestamps()
    end

    create index(:card_stat_def, [:deck_id])
    create unique_index(:card_stat_def, [:deck_id, :key])

    alter table(:card) do
      add :stat_box, :map
    end
  end
end
