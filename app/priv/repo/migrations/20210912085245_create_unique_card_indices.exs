defmodule App.Repo.Migrations.CreateUniqueCardIndices do
  use Ecto.Migration

  def change do
    create unique_index(:card, [:deck_id, :unique_id])
  end
end
