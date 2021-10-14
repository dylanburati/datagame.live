defmodule App.Entities.TriviaDef do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck
  alias App.Entities.CardTagDef

  schema "trivia_def" do
    field :question_format, :string
    field :question_column_name, :string
    field :option_column_name, :string
    field :selection_length, :integer
    field :selection_min_true, :integer
    field :selection_max_true, :integer
    field :selection_compare_type, :string
    field :answer_type, :string
    belongs_to :deck, Deck  # required
    belongs_to :question_tag_def, CardTagDef
    belongs_to :option_tag_def, CardTagDef

    timestamps()
  end

  def validations(trivia_def) do
    changeset = trivia_def
    |> validate_required([
      :question_format, :selection_min_true, :selection_max_true,
      :selection_length, :selection_compare_type, :answer_type
    ])
    |> validate_inclusion(:question_column_name, ~w(title tag1))
    |> validate_inclusion(:option_column_name, ~w(title tag1))
    |> validate_inclusion(:selection_compare_type, ~w(t eq neq))
    |> validate_inclusion(:answer_type, ~w(selection poprank))
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

    changeset = case get_field(changeset, :question_column_name) do
      nil ->
        case get_field(changeset, :option_column_name) do
          nil ->
            changeset
            |> add_error(
              :question_column_name,
              "at least one side of the trivia def must be 'title' or 'tag1'"
            )
          _ -> changeset |> assoc_constraint(:question_tag_def)
        end
      _ ->
        case get_field(changeset, :option_column_name) do
          nil -> changeset |> assoc_constraint(:option_tag_def)
          _ -> changeset
        end
    end

    changeset
    |> assoc_constraint(:deck)
    |> unique_constraint([:deck_id, :question_format])
  end
end
