defmodule App.Entities.Trivia.CardQuestionStatOptions do
  defstruct [
    :deck_id,
    :question_format,
    :question_difficulty,
    :option_difficulty,
    :compare_type,
    :max_correct_options,
    :max_incorrect_options,
    # ===============
    :question_col_name,
    :option_stat_def
  ]
end
