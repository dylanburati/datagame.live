defmodule App.Repo.Migrations.CreatePairingInstance do
  use Ecto.Migration

  def change do
    create table(:pairing_instance) do
      add :subset, :string, null: false
      add :info, :string
      add :pairing_id, references(:pairing, on_delete: :delete_all)
      add :card_id1, references(:card, type: :binary_id, on_delete: :delete_all)
      add :card_id2, references(:card, type: :binary_id, on_delete: :delete_all)

      timestamps()
    end

    create index(:pairing_instance, [:pairing_id])
    create index(:pairing_instance, [:card_id1])
    create index(:pairing_instance, [:card_id2])
    create unique_index(:pairing_instance, [:pairing_id, :subset, :card_id1, :card_id2])
  end
end
