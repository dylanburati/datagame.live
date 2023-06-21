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

  def quantile_of_sorted_list([], _), do: :error
  def quantile_of_sorted_list(_, q) when q < 0 or q > 1, do: :error
  def quantile_of_sorted_list([el], _), do: el
  def quantile_of_sorted_list(enum, q) do
    n = length(enum)
    idx = q * (n - 1)
    left = trunc(idx)
    alpha = idx - left
    if alpha == 0 do
      Enum.at(enum, left)
    else
      [m1 | [m2 | _]] = Enum.drop(enum, left)
      (1 - alpha) * m1 + alpha * m2
    end
  end

  def median_of_sorted_list(enum) do
    quantile_of_sorted_list(enum, 0.5)
  end

  def parse_float!(str) do
    {num, _} = Float.parse(str)
    num
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

  def cascade_error([]), do: {:ok, []}
  def cascade_error([:error | _]), do: :error
  def cascade_error([{:ok, v} | rest]) do
    case cascade_error(rest) do
      {:ok, lst} -> {:ok, [v | lst]}
      _ -> :error
    end
  end

  def changeset_error_strings(kw_lst) do
    Enum.map(kw_lst, fn {k, {msg, _}} -> "#{k}: #{msg}" end)
  end

  def add_timestamps(map) do
    dt = NaiveDateTime.utc_now() |> NaiveDateTime.truncate(:second)
    Map.merge(map, %{inserted_at: dt, updated_at: dt})
  end

  @spec maybe_filter(Enum.t, boolean, (Enum.element -> boolean)) :: Enum.t
  def maybe_filter(enum, false, _fun), do: enum
  def maybe_filter(enum, true, fun) do
    Enum.filter(enum, fun)
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

  @spec to_base16(non_neg_integer, String.t) :: String.t
  def to_base16(num, alpha) when is_number(num) do
    with ch when is_binary(ch) <- String.at(alpha, num &&& 15) do
      if num < 16, do: ch, else: to_base16(num >>> 4, alpha) <> ch
    else
      _ -> raise ArgumentError, "to_base16 requires a 16-character alphabet"
    end
  end

  defp from_base16_recur([], _alpha_map), do: {:ok, 0}
  defp from_base16_recur([ch | rest_chars], alpha_map) do
    # char_lst is reversed
    with {:ok, num} <- from_base16_recur(rest_chars, alpha_map) do
      case Map.get(alpha_map, ch) do
        nil -> :error
        digit -> {:ok, (num <<< 4) ||| digit}
      end
    end
  end

  @spec from_base16(String.t, String.t) :: {:ok, non_neg_integer} | :error
  def from_base16(str, alpha \\ "0123456789abcdef") when is_binary(str) do
    alpha_map = String.to_charlist(alpha)
    |> Enum.with_index()
    |> Map.new()
    from_base16_recur(
      String.to_charlist(str) |> Enum.reverse(),
      alpha_map
    )
  end

  @spec from_base16!(String.t, String.t) :: non_neg_integer
  def from_base16!(str, alpha \\ "0123456789abcdef") when is_binary(str) do
    {:ok, res} = from_base16(str, alpha)
    res
  end

  @spec hex_random(non_neg_integer, String.t) :: String.t
  def hex_random(num_chars, alpha) do
    num_bytes = ceil(num_chars / 2.0)
    blist = :rand.bytes(num_bytes) |> :binary.bin_to_list()
    Enum.map_join(blist, "", fn b ->
      String.at(alpha, (b >>> 4) &&& 15) <> String.at(alpha, b &&& 15)
    end)
    |> String.slice(0, num_chars)
  end

  @spec hex_random(non_neg_integer) :: String.t
  def hex_random(num_chars) do
    hex_random(num_chars, "0123456789abcdef")
  end

  def image_url(%{id: id, title: title}) do
    svg = """
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 50">
      <defs>
        <linearGradient id="gradient-#{Integer.to_string(id)}" gradientTransform="rotate(90)">
          <stop offset="5%" stop-color="#{hash_color(title)}" />
          <stop offset="95%" stop-color="#{hash_color(title <> "x")}" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="30" height="50" rx="4" fill="url(#gradient-#{Integer.to_string(id)})" />
    </svg>
    """
    "data:image/svg+xml,#{URI.encode(svg, &(&1 not in ~C"#<>"))}"
  end

  defp hash_color(str) do
    [r, g, b] = :crypto.hash(:md5, str)
    |> :binary.bin_to_list()
    |> Enum.take(3)
    "rgb(#{r}, #{g}, #{b})"
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

  @spec take_right([elem], integer) :: [elem] when elem: var
  def take_right(lst, count) do
    Enum.drop(lst, max(0, length(lst) - count))
  end

  defp sample_heap(heap, len) do
    Enum.reduce(1..len, {[], heap}, fn _, {acc, h} ->
      case Heap.root(h) do
        {_, v} -> {[v | acc], Heap.pop(h)}
        _ -> {acc, h}
      end
    end)
  end

  def make_heap(lst, priority_getter) do
    lst
    |> Enum.map(fn el -> {priority_getter.(el), el} end)
    |> Enum.into(Heap.min())
  end

  def sample_without_replacement(lst, len, priority_getter \\ fn _el -> :rand.uniform() end) do
    {items, _} = make_heap(lst, priority_getter) |> sample_heap(len)
    items
  end

  def swor_then_replace(heap, len, resetter, priority_getter \\ fn _el -> :rand.uniform() end) do
    {items, poppedheap} = sample_heap(heap, len)
    newheap = Enum.map(items, fn el -> resetter.(el) end)
    |> Enum.reduce(poppedheap, fn el, acc -> Heap.push(acc, {priority_getter.(el), el}) end)
    {items, newheap}
  end
end
