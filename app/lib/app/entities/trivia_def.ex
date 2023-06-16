defmodule App.Entities.TriviaDef do
  @moduledoc """
  An entity that defines a way to generate a Trivia item (question,
  options, and grading expectations).
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck
  alias App.Entities.Pairing
  alias App.Entities.CardStatDef
  alias App.Entities.CardTagDef

  @type t :: %__MODULE__{
    id: non_neg_integer,
    question_format: String.t,
    question_source: String.t,
    question_difficulty: float,
    question_pairing_subset: String.t,
    option_source: String.t,
    option_difficulty: float,
    selection_length: integer,
    selection_min_true: integer,
    selection_max_true: integer,
    selection_compare_type: String.t,
    answer_type: String.t,
    deck_id: non_neg_integer | nil,
    pairing_id: non_neg_integer | nil,
    question_tag_def_id: non_neg_integer | nil,
    option_stat_def_id: non_neg_integer | nil,
    option_tag_def_id: non_neg_integer | nil,
    deck: Deck.t | nil,
    pairing: Pairing.t | nil,
    option_format_separator: String.t | nil,
    question_tag_def: CardTagDef.t | nil,
    option_stat_def: CardStatDef.t | nil,
    option_tag_def: CardTagDef.t | nil,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "trivia_def" do
    field :question_format, :string
    field :question_source, :string
    field :question_difficulty, :float
    field :question_pairing_subset, :string
    field :option_source, :string
    field :option_difficulty, :float
    field :option_format_separator, :string
    field :selection_length, :integer
    field :selection_min_true, :integer
    field :selection_max_true, :integer
    field :selection_compare_type, :string
    field :answer_type, :string
    belongs_to :deck, Deck  # required
    belongs_to :pairing, Pairing
    belongs_to :question_tag_def, CardTagDef
    belongs_to :option_stat_def, CardStatDef
    belongs_to :option_tag_def, CardTagDef

    timestamps()
  end

  @spec stat_answer_types :: [String.t]
  @doc """
  The list of valid values for a trivia def's `answer_type` when its `option_source` is
  "stat".
  """
  def stat_answer_types(), do: ~w(stat.asc stat.desc stat.min stat.max)

  @doc false
  def validations(trivia_def) do
    changeset = trivia_def
    |> validate_required([
      :question_format, :question_source, :option_source,
      :selection_min_true, :selection_max_true,
      :selection_length, :selection_compare_type, :answer_type
    ])
    |> validate_inclusion(:question_source, ~w(card.title card.cat1 card.cat2 tag pairing))
    |> validate_inclusion(:option_source, ~w(card.title card.cat1 card.cat2 tag stat))
    |> validate_inclusion(:selection_compare_type, ~w(t eq neq))
    |> validate_inclusion(:answer_type, stat_answer_types() ++ ~w(selection hangman matchrank))
    |> validate_number(:selection_length, greater_than: 0)
    |> validate_number(
      :selection_max_true,
      less_than_or_equal_to: get_field(trivia_def, :selection_length, 0)
    )
    |> validate_number(
      :selection_min_true,
      less_than_or_equal_to: get_field(trivia_def, :selection_max_true, 0)
    )
    |> validate_number(
      :selection_min_true,
      greater_than_or_equal_to: 0
    )

    join_type = {
      get_field(changeset, :question_source),
      get_field(changeset, :option_source),
    }
    wrong_join_type_msg = "at least one side of the trivia def must be a card title or category"
    changeset = case join_type do
      {"card." <> _, "card." <> _} -> changeset
      {"card." <> _, "tag"} ->
        changeset |> cast_assoc(:option_tag_def, required: true)
      {"card." <> _, "stat"} ->
        changeset |> cast_assoc(:option_stat_def, required: true)
      {"tag", "card." <> _} ->
        changeset |> cast_assoc(:question_tag_def, required: true)
      {"tag", "tag"} ->
        changeset |> add_error(:question_source, wrong_join_type_msg)
      {"tag", "stat"} ->
        changeset |> add_error(:question_source, wrong_join_type_msg)
      {"pairing", "card.title"} ->
        changeset |> cast_assoc(:pairing, required: true)
      {"pairing", "stat"} ->
        changeset |> cast_assoc(:pairing, required: true) |> cast_assoc(:option_stat_def, required: true)
      {"pairing", _} ->
        changeset |> add_error(:question_source, "Pairing questions must have title or stat answers")
      _ ->
        # error is already caught with validate_inclusion
        changeset
    end

    changeset
    |> assoc_constraint(:deck)
    |> unique_constraint([:deck_id, :question_format])
  end
end
