defmodule App.Entities.TriviaDef do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck
  alias App.Entities.CardStatDef
  alias App.Entities.CardTagDef

  schema "trivia_def" do
    field :question_format, :string
    field :question_source, :string
    field :option_source, :string
    field :selection_length, :integer
    field :selection_min_true, :integer
    field :selection_max_true, :integer
    field :selection_compare_type, :string
    field :answer_type, :string
    belongs_to :deck, Deck  # required
    belongs_to :question_tag_def, CardTagDef
    belongs_to :option_stat_def, CardStatDef
    belongs_to :option_tag_def, CardTagDef

    timestamps()
  end

  def validations(trivia_def) do
    changeset = trivia_def
    |> validate_required([
      :question_format, :question_source, :option_source,
      :selection_min_true, :selection_max_true,
      :selection_length, :selection_compare_type, :answer_type
    ])
    |> validate_inclusion(:question_source, ~w(card.title card.tag1 tag))
    |> validate_inclusion(:option_source, ~w(card.title card.tag1 tag stat))
    |> validate_inclusion(:selection_compare_type, ~w(t eq neq))
    |> validate_inclusion(:answer_type, ~w(selection stat.asc stat.desc))
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
    wrong_join_type_msg = "at least one side of the trivia def must be 'title' or 'tag1'"
    changeset = case join_type do
      {"card." <> _, "card." <> _} -> changeset
      {"card." <> _, "tag"} ->
        changeset |> assoc_constraint(:option_tag_def)
      {"card." <> _, "stat"} ->
        changeset |> assoc_constraint(:option_stat_def)
      {"tag", "card." <> _} ->
        changeset |> assoc_constraint(:question_tag_def)
      {"tag", "tag"} ->
        changeset |> add_error(:question_source, wrong_join_type_msg)
      {"tag", "stat"} ->
        changeset |> add_error(:question_source, wrong_join_type_msg)
      _ ->
        # error is already caught with validate_inclusion
        changeset
    end

    changeset
    |> assoc_constraint(:deck)
    |> unique_constraint([:deck_id, :question_format])
  end
end
