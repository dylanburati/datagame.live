defmodule AppWeb.SheetController do
  use AppWeb, :controller
  alias App.Entities.SheetService

  def show(conn, %{"id" => id}) do
    case SheetService.get_spreadsheet(id) do
      {:ok, sheet_data} -> json(conn, sheet_data)
      {:error, err} -> json(conn, %{"error" => to_string(err)})
    end
  end

  def create(conn, %{"spreadsheetId" => id, "decks" => deck_uploads})
  when not (is_binary(id) and is_list(deck_uploads)) do
    conn
    |> put_status(400)
    |> json(%{"error" => "spreadsheetId must be a string; decks must be a list"})
  end

  def create(conn, %{"spreadsheetId" => id, "decks" => deck_uploads}) do
    with {:ok, decks, fails} <- SheetService.insert_sheet_decks(id, deck_uploads) do
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
        conn
        |> json(%{
          "data" => for deck <- decks do
            %{
              "id" => deck.id,
              "spreadsheetId" => deck.spreadsheet_id,
              "title" => deck.title,
              "cardCount" => length(deck.cards)
            }
          end,
          "errors" => for {id, nm, msg} <- fails do
            %{"spreadsheetId" => id, "title" => nm, "message" => msg}
          end
        })
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
