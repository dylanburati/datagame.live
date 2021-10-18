defmodule App.Repo.Migrations.TriviaDefAllowStatQuestions do
  use Ecto.Migration

  def change do
    execute "DELETE FROM trivia_def", ""
    rename table(:trivia_def), :question_column_name, to: :question_source
    rename table(:trivia_def), :option_column_name, to: :option_source
    alter table(:trivia_def) do
      # modify :question_source, :string, null: false
      # modify :option_source, :string, null: false

      add :option_stat_def_id, references(:card_stat_def, on_delete: :delete_all)
    end
    create index(:trivia_def, [:option_stat_def_id])
  end
end
