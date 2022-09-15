defmodule App.Repo.Migrations.CreateCardTag do
  use Ecto.Migration

  def change do
    create table(:card_tag, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :position, :integer
      add :value, :string

      # FK
      add :card_id, references(:card, type: :binary_id)

      timestamps()
    end

  end
end
