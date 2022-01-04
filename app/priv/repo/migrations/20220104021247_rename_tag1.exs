defmodule App.Repo.Migrations.RenameTag1 do
  use Ecto.Migration

  def change do
    rename table(:deck), :has_tag1_count, to: :has_cat1_count
    rename table(:deck), :tag1_nunique, to: :cat1_nunique
    rename table(:card), :tag1, to: :cat1
    alter table(:card) do
      add :cat2, :string
    end

    execute(
      "UPDATE trivia_def SET question_source = 'card.cat1' WHERE question_source = 'card.tag1'",
      "UPDATE trivia_def SET question_source = 'card.tag1' WHERE question_source = 'card.cat1'"
    )

    execute(
      "UPDATE card_tag_def SET position = position - 1",
      "UPDATE card_tag_def SET position = position + 1"
    )
  end
end
