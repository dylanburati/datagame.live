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


  def median_of_sorted_list([]), do: :error
  def median_of_sorted_list([el]), do: el
  def median_of_sorted_list(enum) do
    n = length(enum)
    mid = floor((n - 1) / 2)
    # sl = Enum.sort(enum)
    case rem(n, 2) do
      0 ->
        [m1 | [m2 | _]] = Enum.drop(enum, mid)
        0.5 * (m1 + m2)
      1 -> Enum.at(enum, mid)
    end
  end

  def float_or_nil(nil), do: nil
  def float_or_nil(str) do
    case Float.parse(str) do
      {x, _} -> x
      :error -> nil
    end
  end

  def non_empty_or_nil(nil), do: nil
  def non_empty_or_nil(""), do: nil
  def non_empty_or_nil(str), do: str

  def changeset_error_strings(kw_lst) do
    Enum.map(kw_lst, fn {k, {msg, _}} -> "#{k}: #{msg}" end)
  end

  def add_timestamps(map) do
    dt = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    Map.merge(map, %{inserted_at: dt, updated_at: dt})
  end

  def maybe_put(map, false, _key, _val), do: map
  def maybe_put(map, true, key, val) do
    Map.put(map, key, val)
  end

  def maybe_put_lazy(map, false, _key, _supplier), do: map
  def maybe_put_lazy(map, true, key, supplier) do
    Map.put(map, key, supplier.())
  end
end
