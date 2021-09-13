defmodule AppWeb.DeckController do
  use AppWeb, :controller
  alias App.Entities.DeckService

  def index(conn, _params) do
    render(conn, "decks.json", %{decks: DeckService.list()})
  end

  def show(conn, %{"id" => id}) do
    case DeckService.show(id) do
      {:ok, deck} -> render(conn, "deck.json", %{deck: deck})
      {:error, err} -> conn |> put_status(400) |> json(%{"error" => to_string(err)})
    end
  end
end
