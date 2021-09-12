defmodule AppWeb.SheetController do
  use AppWeb, :controller
  alias App.Entities.SheetService

  def show(conn, %{"id" => id}) do
    sheet = case id do
      "1R_OPZFylZZt95wVaLg7oq3VxSKX8C06bRxK40udMNO4" ->
        {:ok, File.read!("./priv/static/sheetTemp.json") |> Poison.decode!}
      sheet_id ->
        SheetService.get_spreadsheet(sheet_id)
    end
    case sheet do
      {:ok, sheet_data} -> json(conn, sheet_data)
      {:error, err} -> json(conn, %{"error" => to_string(err)})
    end
  end
end
