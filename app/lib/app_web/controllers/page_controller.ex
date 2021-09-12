defmodule AppWeb.PageController do
  use AppWeb, :controller

  def index(conn, _params) do
    render(conn, "index.html")
  end

  def sheet(conn, _params) do
    render(conn, "sheet.html")
  end

  def import_sheet(conn, %{"link" => %{"href" => href}}) do
    IO.puts Regex.run(~r|^(?:https?://)?docs.google.com/spreadsheets/d/([^/]*)|, href)
    case Regex.run(~r|^(?:https?://)?docs.google.com/spreadsheets/d/([^/]*)|, href) do
      nil ->
        conn
        |> put_flash(:error, "'#{href}' is not recognized as a Google Sheets link")
        |> redirect(to: "/")
      [_, sheet_id] ->
        render(conn, "sheet.html", sheet_id: sheet_id)
      _ ->
        conn
        |> put_flash(:error, "Unknown error")
        |> redirect(to: "/")
    end
  end
end
