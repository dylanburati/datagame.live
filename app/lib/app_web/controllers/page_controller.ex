defmodule AppWeb.PageController do
  use AppWeb, :controller

  def index(conn, _params) do
    render(conn, "index.html")
  end

  def sheet(conn, _params) do
    render(conn, "sheet.html")
  end
end
