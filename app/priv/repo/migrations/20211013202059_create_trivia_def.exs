defmodule App.Repo.Migrations.CreateTriviaDef do
  use Ecto.Migration

  def change do
    create table(:trivia_def) do
      add :question_format, :string, null: false
      add :question_column_name, :string
      add :option_column_name, :string
      add :selection_min_true, :integer, null: false
      add :selection_max_true, :integer, null: false
      add :selection_length, :integer, null: false
      add :selection_compare_type, :string, null: false
      add :answer_type, :string, null: false
      add :deck_id, references(:deck, on_delete: :delete_all)
      add :question_tag_def_id, references(:card_tag_def, on_delete: :delete_all)
      add :option_tag_def_id, references(:card_tag_def, on_delete: :delete_all)

      timestamps()
    end

    create index(:trivia_def, [:question_tag_def_id])
    create index(:trivia_def, [:option_tag_def_id])
    create unique_index(:trivia_def, [:deck_id, :question_format])
  end
end
