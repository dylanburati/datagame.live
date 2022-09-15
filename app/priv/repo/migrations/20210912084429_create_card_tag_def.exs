defmodule App.Repo.Migrations.CreateCardTagDef do
  use Ecto.Migration

  def change do
    create table(:card_tag_def) do
      add :position, :integer
      add :label, :string

      # FK
      add :deck_id, references(:deck)

      timestamps()
    end

    create unique_index(:card_tag_def, [:deck_id, :position])
  end
end
