defmodule App.Entities.CardStatDef do
  @moduledoc """
  A record that defines properties (type, label, etc.) for one stat that
  can appear on the cards of a specific deck.
  """

  use Ecto.Schema
  import Ecto.Changeset

  @type t :: %__MODULE__{
    id: non_neg_integer,
    key: String.t,
    label: String.t,
    stat_type: String.t,
    axis_mod: String.t | nil,
    axis_min: float | nil,
    axis_max: float | nil,
    deck_id: non_neg_integer,
    inserted_at: NaiveDateTime.t,
    updated_at: NaiveDateTime.t,
  }

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

  def retype(:id), do: "non_neg_integer"
  def retype(:binary_id), do: "String.t"
  def retype(:integer), do: "integer"
  def retype(:float), do: "float"
  def retype(:boolean), do: "boolean"
  def retype(:map), do: "map"
  def retype(:string), do: "String.t"
  def retype(:naive_datetime), do: "NaiveDateTime.t"
  def retype(%Ecto.Association.Has{cardinality: :many, related: m}) do
    "[#{m}.t]"
  end
  def retype(%Ecto.Association.Has{related: m}) do
    "#{m}.t"
  end
  def retype(%Ecto.Association.BelongsTo{related: m}) do
    "#{m}.t"
  end
  def retype(%Ecto.Association.ManyToMany{related: m}) do
    "[#{m}.t]"
  end

  @doc """
  Lists all supported stat types.
  """
  @spec all_stat_types() :: [String.t]
  def all_stat_types() do
    ~w(string number date dollar_amount lat_lon)
  end

  @doc """
  Parses the Elixir value corresponding to the given stat type and stat content.
  """
  @spec parse_stat(typ :: String.t, str :: String.t | nil) :: {:ok, any} | :error
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
      {:ok, d} -> {:ok, NaiveDateTime.new!(d, ~T[00:00:00])}
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
  @spec infer_type(values :: [String.t | nil]) :: {:ok, String.t} | :error
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

  @spec validations(Ecto.Changeset.t) :: Ecto.Changeset.t
  def validations(card_stat_def) do
    card_stat_def
    |> validate_required([:key, :label, :stat_type])
    |> validate_inclusion(:stat_type, all_stat_types())
    |> unique_constraint([:deck_id, :key])
  end
end
