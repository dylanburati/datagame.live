defmodule App.Entities.Pairing do
  @moduledoc """
  An entity that the trivia loader can use to generate pairs of cards that fit
  a list of criteria, and then compute stats on the card pair using the stats
  of each individual card.

  TODO the following functions depend directly on the structure within Pairing's
  criteria: `aggregated_stat_def`, `App.Entities.PairingService.calc_agg`,
  `App.Entities.PairingService.eval_join_conditions`,
  `App.Entities.PairingService.eval_popularity`.
  """

  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.CardStatDef
  alias App.Entities.Deck

  @type criteria :: map
  @type t :: %__MODULE__{
    id: non_neg_integer,
    criteria: criteria,
    name: String.t,
    deck_id: non_neg_integer,
    deck: Deck.t,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

  schema "pairing" do
    field :criteria, :map
    field :name, :string

    belongs_to :deck, Deck
    timestamps()
  end

  @spec validations(Ecto.Changeset.t) :: Ecto.Changeset.t
  def validations(pairing) do
    pairing
    |> validate_required([:name, :criteria])
  end

  @spec aggregated_stat_def(t, CardStatDef.t) :: CardStatDef.t
  @doc """
  Gets the appropriate result stat type definition based on this pairing's aggregation
  function, or returns the `CardStatDef` unchanged if no aggregation is used.
  """
  def aggregated_stat_def(pairing, stat_def) do
    with %{"agg" => aggs} <- pairing.criteria,
         {:ok, funcname} <- Map.fetch(aggs, stat_def.key) do
      case funcname do
        "geodist" -> Map.merge(stat_def, %{label: "Distance", stat_type: "km_distance"})
        _ -> stat_def
      end
    else
      _ -> stat_def
    end
  end
end
