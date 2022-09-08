defmodule App.Entities.Trivia.PairingQuestionStatOptions do
  defstruct [
    :question_format,
    :question_difficulty,
    :option_difficulty,
    :compare_type,
    :max_correct_options,
    :max_incorrect_options,
    # ===============
    :question_subset,
    :question_pairing,
    :option_format_separator,
    :option_stat_def
  ]
end
