defmodule App.Entities.Trivia.PairingQuestionCardOptions do
  defstruct [
    :question_format,
    :question_difficulty,
    :option_difficulty,
    :compare_type,
    :max_correct_options,
    :max_incorrect_options,
    :answer_type,
    # ===============
    :question_subset,
    :question_pairing,
    :option_format_separator
  ]
end
