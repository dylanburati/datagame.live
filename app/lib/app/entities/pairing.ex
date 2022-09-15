defmodule App.Entities.Pairing do
  use Ecto.Schema
  import Ecto.Changeset

  alias App.Entities.Deck

  schema "pairing" do
    field :criteria, :map
    field :name, :string

    belongs_to :deck, Deck
    timestamps()
  end

  @doc false
  def changeset(pairing, attrs) do
    pairing
    |> cast(attrs, [:name, :criteria])
    |> validate_required([:name, :criteria])
  end

  def aggregated_stat_def(pairing, stat_def) do
    with %{"agg" => aggs} <- pairing.criteria,
         {:ok, funcname} <- Map.fetch(aggs, stat_def.key) do
      case funcname do
        "geodist" -> Map.merge(stat_def, %{label: "Distance", stat_type: "km_distance"})
        _ -> pairing
      end
    else
      _ -> pairing
    end
  end
end
