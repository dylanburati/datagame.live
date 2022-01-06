defmodule App.Utils do
  import Bitwise

  def post_fetch_json(url, body, headers) do
    with {:ok, %{body: body}} <- HTTPoison.post(url, body, headers) do
      Jason.decode(body)
    end
  end

  def fetch_json(url, headers) do
    with {:ok, %{body: body}} <- HTTPoison.get(url, headers) do
      Jason.decode(body)
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

  @spec maybe_put(map, boolean, any, any) :: map
  def maybe_put(map, false, _key, _val), do: map
  def maybe_put(map, true, key, val) do
    Map.put(map, key, val)
  end

  @spec maybe_put_lazy(map, boolean, any, (() -> any)) :: map
  def maybe_put_lazy(map, false, _key, _supplier), do: map
  def maybe_put_lazy(map, true, key, supplier) do
    Map.put(map, key, supplier.())
  end

  def hex_random(num_chars) do
    hex_random(num_chars, "0123456789abcdef")
  end

  def to_base16(num, alpha) when is_number(num) do
    cond do
      num < 16 ->
        String.at(alpha, num &&& 15)
      true ->
        to_base16(num >>> 4, alpha) <> String.at(alpha, num &&& 15)
    end
  end

  def from_base16_recur([], _alpha_map), do: {:ok, 0}
  def from_base16_recur([ch | rest_chars], alpha_map) do
    # char_lst is reversed
    with {:ok, num} <- from_base16_recur(rest_chars, alpha_map) do
      case Map.get(alpha_map, ch) do
        nil -> :error
        digit -> {:ok, (num <<< 4) ||| digit}
      end
    end
  end

  def from_base16(str, alpha) when is_binary(str) do
    alpha_map = String.to_charlist(alpha)
    |> Enum.with_index()
    |> Map.new()
    from_base16_recur(
      String.to_charlist(str) |> Enum.reverse(),
      alpha_map
    )
  end

  def hex_random(num_chars, alpha) do
    num_bytes = ceil(num_chars / 2.0)
    blist = :rand.bytes(num_bytes) |> :binary.bin_to_list()
    Enum.map_join(blist, "", fn b ->
      String.at(alpha, (b >>> 4) &&& 15) <> String.at(alpha, b &&& 15)
    end)
    |> String.slice(0, num_chars)
  end

  @spec find_last([elem], default, (elem -> boolean)) :: elem | default when elem: var, default: var
  def find_last(lst, default \\ nil, pred) do
    {_, result} = List.foldr(lst, {false, default}, fn el, acc ->
      {found?, _} = acc
      case found? do
        true -> acc
        _ -> if pred.(el), do: {true, el}, else: acc
      end
    end)
    result
  end
end
