defmodule App.Utils do
  def post_fetch_json(url, body, headers) do
    with {:ok, %{body: body}} <- HTTPoison.post(url, body, headers) do
      Poison.decode(body)
    end
  end

  def fetch_json(url, headers) do
    with {:ok, %{body: body}} <- HTTPoison.get(url, headers) do
      Poison.decode(body)
    end
  end

  defp try_tail([_ | tl]), do: tl
  defp try_tail([]), do: []

  defp transpose_recur(_, n) when n == 0 do
    []
  end

  defp transpose_recur(enum_of_enums, n) do
    remaining = Enum.map(enum_of_enums, &try_tail/1)
    [Enum.map(enum_of_enums, &(Enum.at(&1, 0))) | transpose_recur(remaining, n - 1)]
  end

  def transpose(enum_of_enums) do
    total = Enum.map(enum_of_enums, &length/1) |> Enum.max()
    transpose_recur(enum_of_enums, total)
  end

  def float_or_nil(nil), do: nil
  def float_or_nil(str) do
    case Float.parse(str) do
      {x, _} -> x
      :error -> nil
    end
  end

  def changeset_error_strings(kw_lst) do
    Enum.map(kw_lst, fn {k, {msg, _}} -> "#{k}: #{msg}" end)
  end

  def add_timestamps(map) do
    dt = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    Map.merge(map, %{inserted_at: dt, updated_at: dt})
  end
end
