defmodule App.Repo.Migrations.CardStatDefAxisFields do
  use Ecto.Migration

  def change do
    alter table(:card_stat_def) do
      add :axis_mod, :string
      add :axis_min, :float
      add :axis_max, :float
    end
  end
end
