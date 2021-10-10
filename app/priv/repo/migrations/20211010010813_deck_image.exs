defmodule App.Repo.Migrations.DeckImage do
  use Ecto.Migration

  def change do
    drop index(:deck, [:title, :spreadsheet_id])
    rename table(:deck), :title, to: :sheet_name
    create unique_index(:deck, [:spreadsheet_id, :sheet_name])
    alter table(:deck) do
      add :title, :string
      add :image_url, :string
      add :image_dominant_color, :string
    end
    execute(
      "UPDATE deck SET title = sheet_name",
      "SELECT 1"
    )
    execute(
      "UPDATE deck SET sheet_name = CONCAT('Deck:', REPLACE(sheet_name, ' / ', ':'))",
      "SELECT 1"
    )
    alter table(:deck) do
      modify :title, :string, null: false
    end
  end
end
