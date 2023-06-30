defmodule App.Repo.Migrations.Reap do
  use Ecto.Migration

  def change do
    drop table(:pairing_instance)
    drop table(:trivia_def)
    drop table(:pairing)
    drop table(:card_card_tag)
    drop table(:card_tag)
    drop table(:card)
    drop table(:card_tag_def)
    drop table(:card_stat_def)
    drop unique_index(:deck, [:spreadsheet_id, :sheet_name])
    execute "DELETE FROM deck", ""
    alter table(:deck) do
      remove :sheet_name, :string
      remove :category_label, :string
      remove :enabled_count, :integer
      remove :has_popularity_count, :integer
      remove :has_id_count, :integer
      remove :has_cat1_count, :integer
      remove :cat1_nunique, :integer
      remove :image_dominant_color, :string
      add :revision, :integer, null: false
      add :data, :text, null: false
    end
    create unique_index(:deck, [:spreadsheet_id, :title])
  end
end
