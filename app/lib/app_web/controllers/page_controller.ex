defmodule AppWeb.PageController do
  use AppWeb, :controller

  alias App.Entities.User
  alias App.Entities.DeckService

  def index(conn, _params) do
    render(conn, "index.html", decks: DeckService.list(), changeset: Ecto.Changeset.change(%User{}))
  end

  def sheet(conn, _params) do
    render(conn, "sheet.html", body_class: "fluid", main_class: "flex flex-col viewport-minus-55px")
  end

  def sheet_advanced(conn, _params) do
    render(conn, "sheet-advanced.html")
  end
end
