defmodule App.Repo.Migrations.CreateCardTag do
  use Ecto.Migration

  def change do
    create table(:card_tag) do
      add :position, :integer
      add :value, :string

      # FK
      add :card_id, references(:card)

      timestamps()
    end

  end
end
