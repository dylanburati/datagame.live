defmodule AppWeb.PageController do
  use AppWeb, :controller
  alias App.Entities.DeckService

  def sheet(conn, _params) do
    render(conn, "sheet.html", body_class: "fluid", main_class: "flex flex-col viewport-minus-55px")
  end

  def sheet_advanced(conn, _params) do
    render(conn, "sheet-advanced.html")
  end
end
