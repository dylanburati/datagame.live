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

  def parse_stat(_, nil), do: {:ok, nil}
  def parse_stat(_, arg) when not is_binary(arg), do: :error
  def parse_stat("string", str), do: {:ok, str}
  def parse_stat("number", str) do
    case Float.parse(String.replace(str, ",", "")) do
      {x, ""} -> {:ok, x}
      _ -> :error
    end
  end
  def parse_stat("date", str) do
    case Date.from_iso8601(str) do
      {:ok, d} -> {:ok, DateTime.new!(d, Time.from_seconds_after_midnight(0))}
      _ -> :error
    end
  end
  def parse_stat("dollar_amount", "$" <> str) do
    parse_stat("number", str)
  end
  def parse_stat("dollar_amount", _), do: :error
  def parse_stat("lat_lon", str) do
    with [lat_s, lon_s] <- String.split(str, ","),
         {lat, ""} <- Float.parse(String.trim(lat_s)),
         {lon, ""} <- Float.parse(String.trim(lon_s)) do
      cond do
        abs(lat) <= 90 and abs(lon) <= 180 -> {:ok, {lat, lon}}
        true -> :error
      end
    else
      _ -> :error
    end
  end
  def parse_stat("km_distance", str) do
    # TODO: separate stat type from stat unit
    parse_stat("number", str)
  end

  defp can_be_type(typename, statval), do: parse_stat(typename, statval) != :error

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
