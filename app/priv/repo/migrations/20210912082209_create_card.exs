defmodule App.Repo.Migrations.CreateCard do
  use Ecto.Migration

  def change do
    create table(:card, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :title, :string
      add :is_disabled, :boolean, default: false, null: false
      add :popularity, :float
      add :unique_id, :string
      add :tag1, :string
      add :notes, :string

      # FK
      add :deck_id, references(:deck)

      timestamps()
    end

  end
end
