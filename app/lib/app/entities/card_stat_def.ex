defmodule App.Entities.CardStatDef do
  use Ecto.Schema
  import Ecto.Changeset

  schema "card_stat_def" do
    field :key, :string
    field :label, :string
    field :stat_type, :string
    field :axis_mod, :string
    field :axis_min, :float
    field :axis_max, :float
    field :deck_id, :id

    timestamps()
  end

  @spec all_stat_types() :: [String.t]
  def all_stat_types() do
    ~w(string number date dollar_amount lat_lon)
  end

  defp can_be_type(_, nil), do: true
  defp can_be_type(_, arg) when not is_binary(arg), do: false
  defp can_be_type("string", _), do: true
  defp can_be_type("dollar_amount", str) do
    String.starts_with?(str, "$") and can_be_type("number", String.slice(str, 1..-1))
  end
  defp can_be_type("number", str) do
    case Float.parse(String.replace(str, ",", "")) do
      {_, ""} -> true
      _ -> false
    end
  end
  defp can_be_type("lat_lon", str) do
    case String.split(str, ",") do
      [lat_s, lon_s] ->
        case {Float.parse(String.trim(lat_s)), Float.parse(String.trim(lon_s))} do
          {{lat, ""}, {lon, ""}} -> abs(lat) <= 90 and abs(lon) <= 180
          _ -> false
        end
      _ -> false
    end
  end
  defp can_be_type("date", str) do
    case Date.from_iso8601(str) do
      {:ok, _} -> true
      _ -> false
    end
  end

  @doc """
  Gets the best type for the values of the given list.
  """
  @spec infer_type([String.t | nil]) :: {:ok, String.t} | :error
  def infer_type(values) do
    type_lst = all_stat_types()
    matching = Enum.reduce(values, type_lst, fn val, acc ->
      Enum.filter(acc, &can_be_type(&1, val))
    end)
    case matching do
      [] -> :error
      [typ] -> {:ok, typ}
      ["string", typ] -> {:ok, typ}
      lst -> {:ok, Enum.at(lst, 0)}
    end
  end

  @doc false
  def validations(card_stat_def) do
    card_stat_def
    |> validate_required([:key, :label, :stat_type])
    |> validate_inclusion(:stat_type, all_stat_types())
    |> unique_constraint([:deck_id, :key])
  end
end
