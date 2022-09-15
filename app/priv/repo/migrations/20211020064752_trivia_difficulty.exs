defmodule App.Repo.Migrations.TriviaDifficulty do
  use Ecto.Migration

  def change do
    alter table(:trivia_def) do
      add :question_difficulty, :float, null: false, default: 0.0
      add :option_difficulty, :float, null: false, default: 0.0
    end
    alter table(:card) do
      add :popularity_unscaled, :float
    end
    execute "UPDATE card SET popularity_unscaled = popularity", ""
    alter table(:card) do
      modify :popularity_unscaled, :float, null: false
    end
    alter table(:deck) do
      remove :popularity_min, :float
      remove :popularity_median, :float
      remove :popularity_max, :float
    end
  end
end
