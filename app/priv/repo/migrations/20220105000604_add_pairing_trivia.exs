defmodule App.Repo.Migrations.AddPairingTrivia do
  use Ecto.Migration

  def change do
    alter table(:trivia_def) do
      add :question_pairing_subset, :string
      add :option_format_separator, :string
      add :pairing_id, references(:pairing, on_delete: :delete_all)
    end

    create index(:trivia_def, [:pairing_id])
  end
end
