defmodule AppWeb.SheetView do
  use AppWeb, :view

  alias AppWeb.DeckView

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
    Map.update!(card_table, :stat_defs, fn lst ->
      Enum.map(lst, fn sd ->
        Map.update!(sd, :data, &stat_array_json/1)
      end)
    end)
  end

  def render("sheet_.json", %{data: lst}) do
    Enum.map(lst, fn %{callouts: callouts, deck: deck} ->
      %{
        callouts: Enum.map(callouts, &callout_json/1),
        deck: Map.update!(deck, :data, &card_table_json/1)
      }
    end)
  end

  def render("sheet.json", %{decks: decks, fails: fails}) do
    %{
      data: Enum.map(decks, &DeckView.deck_json/1),
      errors: fails |>
      Enum.map(fn {id, nm, msg} ->
        %{spreadsheetId: id, title: nm, message: msg}
      end)
    }
  end
end
