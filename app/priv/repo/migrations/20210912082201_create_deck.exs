defmodule App.Repo.Migrations.CreateDeck do
  use Ecto.Migration

  def change do
    create table(:deck) do
      add :title, :string
      add :spreadsheet_id, :string
      add :category_label, :string

      timestamps()
    end

    create unique_index(:deck, [:title, :spreadsheet_id])
  end
end
