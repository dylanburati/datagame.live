defmodule App.Entities.Trivia.TagQuestionCardOptions do
  defstruct [
    :deck_id,
    :question_format,
    :question_difficulty,
    :option_difficulty,
    :compare_type,
    :max_correct_options,
    :max_incorrect_options,
    # ===============
    :question_tag_def,
    :option_col_name
  ]
end
