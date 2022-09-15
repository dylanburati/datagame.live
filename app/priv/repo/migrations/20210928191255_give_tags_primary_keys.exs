defmodule App.Repo.Migrations.GiveTagsPrimaryKeys do
  use Ecto.Migration

  def change do
    drop table(:deck_tag)
    create table(:deck_tag) do
      add :value, :string, unique: true, null: false
    end
    create table(:deck_deck_tag) do
      # FK
      add :deck_id, references(:deck, on_delete: :delete_all)
      add :deck_tag_id, references(:deck_tag, on_delete: :delete_all)
    end

    drop table(:card_tag)
    create table(:card_tag, primary_key: false) do
      add :id, :binary_id, primary_key: true
      add :value, :string

      # FK
      add :card_tag_def_id, references(:card_tag_def, on_delete: :delete_all)
    end
    create unique_index(:card_tag, [:card_tag_def_id, :value])
    create table(:card_card_tag) do
      # FK
      add :card_id, references(:card, on_delete: :delete_all, type: :binary_id)
      add :card_tag_id, references(:card_tag, on_delete: :delete_all, type: :binary_id)
    end
  end
end
