defmodule App.Repo.Migrations.AddCardStats do
  use Ecto.Migration

  def change do
    alter table(:deck) do
      modify :title, :string, null: false
      modify :spreadsheet_id, :string, null: false
      add :enabled_count, :integer, null: false
      add :has_popularity_count, :integer, null: false
      add :has_id_count, :integer, null: false
      add :has_tag1_count, :integer, null: false
      add :tag1_nunique, :integer, null: false
      add :popularity_min, :float
      add :popularity_median, :float
      add :popularity_max, :float
    end
    alter table(:card) do
      modify :title, :string, null: false
    end
  end
end
