defmodule App.Repo.Migrations.CreateDeckTag do
  use Ecto.Migration

  def change do
    create table(:deck_tag) do
      add :value, :string

      # FK
      add :deck_id, references(:deck)

      timestamps()
    end
  end
end
