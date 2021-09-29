defmodule App.Repo.Migrations.TagsNotNull do
  use Ecto.Migration

  def change do
    execute "DELETE FROM deck_tag WHERE value IS NULL"
    alter table(:deck_tag) do
      modify :value, :string, null: false
    end
    execute "DELETE FROM card_tag WHERE value IS NULL"
    alter table(:card_tag) do
      modify :value, :string, null: false
    end
  end
end
