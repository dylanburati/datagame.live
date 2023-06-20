defmodule AppWeb.SheetController do
  use AppWeb, :controller
  alias App.Entities.SheetService
  alias App.Entities.DeckService

  def show(conn, %{"id" => id}) do
    if id == "dev" do
      case App.Native.parse_spreadsheet(["Movies", "Animals", "Music:Billboard US", "The Rich and Famous", "Places", "Characters"], File.read!("1687079970025835_in.json")) do
        {:ok, decks_plus} -> render(conn, "sheet_.json", %{data: decks_plus})
        {:error, err} -> json(conn, %{"error" => to_string(err)})
      end
    else
      case SheetService.get_spreadsheet(id) do
        {:ok, sheet_data} -> json(conn, sheet_data)
        {:error, err} -> json(conn, %{"error" => to_string(err)})
      end
    end
  end

  def create(conn, %{"spreadsheetId" => id, "decks" => deck_uploads})
  when not (is_binary(id) and is_list(deck_uploads)) do
    conn
    |> put_status(400)
    |> json(%{"error" => "spreadsheetId must be a string; decks must be a list"})
  end

  def create(conn, %{"spreadsheetId" => id, "decks" => deck_uploads}) do
    with {:ok, decks_in, fails} <- SheetService.insert_sheet_decks(id, deck_uploads) do
      decks = decks_in |> Enum.map(fn %{id: id} -> DeckService.show!(id) end)
      if Enum.empty?(decks) do
        case Enum.empty?(fails) do
          true ->
            conn |> put_status(400) |> json(%{"error" => "No decks provided"})
          false ->
            conn
            |> put_status(400)
            |> json(%{
              "errors" => for {id, nm, msg} <- fails do
                %{"spreadsheetId" => id, "title" => nm, "message" => msg}
              end
            })
        end
      else
        render(conn, "sheet.json", %{decks: decks, fails: fails})
      end
      # todo catch 500 error
    end
  end

  def create(conn, _params) do
    conn
    |> put_status(400)
    |> json(%{"error" => "Expected an object with keys 'spreadsheetId' and 'decks'"})
  end
end
