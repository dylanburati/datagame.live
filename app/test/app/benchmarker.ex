defmodule App.Benchmarker do
  import App.Utils

  def benchmark(iters, acc, fun, opts \\ []) do
    {times, result} = 1..iters
    |> Enum.reduce({[], acc}, fn _, {myacc, calleracc} ->
      now = System.system_time(:microsecond)
      response = fun.(calleracc)
      {group, nxt} = if Keyword.get(opts, :grouped, false) do
        {response.group, response.acc}
      else
        {nil, response}
      end
      t1 = System.system_time(:microsecond)

      {[{group, t1 - now} | myacc], nxt}
    end)

    time_summary = Enum.group_by(times, &(elem(&1, 0)), &(elem(&1, 1)))
    |> Map.new(fn {g, timelst} ->
      sl = Enum.sort(timelst)
      smm = %{
        min: quantile_of_sorted_list(sl, 0),
        p1: quantile_of_sorted_list(sl, 0.01),
        p50: quantile_of_sorted_list(sl, 0.5),
        p90: quantile_of_sorted_list(sl, 0.9),
        p99: quantile_of_sorted_list(sl, 0.99),
        max: quantile_of_sorted_list(sl, 1)
      }
      |> maybe_put(Keyword.get(opts, :grouped, false), :count, length(sl))
      {g, smm}
    end)

    time_summary = if map_size(time_summary) == 1, do: time_summary[nil], else: time_summary
    {time_summary, result}
  end
end
