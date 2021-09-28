defmodule AppWeb.SheetView do
  use AppWeb, :view

  alias AppWeb.DeckView

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
