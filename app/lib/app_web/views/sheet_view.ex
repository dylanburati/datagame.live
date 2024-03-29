defmodule AppWeb.SheetView do
  use AppWeb, :view

  defp callout_json({:warning, msg}) do
    %{kind: "Warning", message: msg}
  end
  defp callout_json({:error, msg}) do
    %{kind: "Error", message: msg}
  end

  defp stat_array_json({:number, amap}) do
    Map.put(amap, :kind, "Number")
  end
  defp stat_array_json({:date, amap}) do
    Map.put(amap, :kind, "Date")
  end
  defp stat_array_json({:lat_lng, %{values: lst}}) do
    %{
      kind: "LatLng",
      values: Enum.map(lst, fn
        {f1, f2} -> [f1, f2]
        nil -> nil
      end)
    }
  end
  defp stat_array_json({:string, amap}) do
    Map.put(amap, :kind, "String")
  end

  defp card_table_json(card_table) do
    card_table
    |> Map.update!(:stat_defs, fn lst ->
      Enum.map(lst, fn sd ->
        Map.update!(sd, :data, &stat_array_json/1)
      end)
    end)
    |> Map.update!(:pairings, fn lst ->
      Enum.map(lst, fn pairing ->
        Map.drop(pairing, [:requirements, :boosts])
      end)
    end)
  end

  def render("deck.json", deck) do
    Map.update!(deck, :data, &card_table_json/1)
  end

  def render("sheet.json", %{data: lst}) do
    Enum.map(lst, fn %{callouts: callouts, deck: deck} ->
      %{
        callouts: Enum.map(callouts, &callout_json/1),
        deck: Map.update!(deck, :data, &card_table_json/1)
      }
    end)
  end
end
