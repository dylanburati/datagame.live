defmodule App.Entities.Trivia.CardQuestionTagOptions do
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
    :option_tag_def
  ]
end
