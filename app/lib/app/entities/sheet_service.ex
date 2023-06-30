defmodule App.Entities.SheetService do
  require Logger

  import String, except: [length: 1]
  import Ecto.Changeset
  import Ecto.Query
  import App.Utils

  alias App.GToken
  alias App.Repo
  alias App.Entities.Deck
  alias App.Entities.Card
  alias App.Entities.CardStatDef
  alias App.Entities.CardTagDef
  alias App.Entities.CardTag

  @base_url "https://sheets.googleapis.com/v4/spreadsheets"
  @tkn_cache_key "SheetService.access_token"

  defp get_new_token() do
    claims = %{
      "scope" => "https://www.googleapis.com/auth/spreadsheets",
      "sub" => nil
    }
    jwt = GToken.generate_and_sign!(claims)
    req_body = URI.encode_query(%{
      "grant_type" => "urn:ietf:params:oauth:grant-type:jwt-bearer",
      "assertion" => jwt
    })
    auth_url = "https://www.googleapis.com/oauth2/v4/token"
    auth_headers = [{"Content-Type", "application/x-www-form-urlencoded"}]
    with {:ok, data} <- post_fetch_json(auth_url, req_body, auth_headers) do
      tkn = data["access_token"]
      App.Cache.insert_with_ttl(@tkn_cache_key, tkn, data["expires_in"] - 3)
      IO.puts "New Google access token"
      {:ok, tkn}
    end
  end

  defp authorize() do
    case App.Cache.lookup(@tkn_cache_key) do
      nil -> get_new_token()
      tkn -> {:ok, tkn}
    end
  end

  defp get_spreadsheet_values(spreadsheet_id, sheets, auth) do
    decks = sheets
    |> Enum.map(fn item -> item["properties"] end)
    |> Enum.filter(fn
      %{"sheetType" => "GRID"} -> true
      _ -> false
    end)
    |> Enum.map(fn %{"title" => title, "gridProperties" => grid_props} ->
      case title do
        "Deck:" <> name ->
          h = grid_props["rowCount"]
          w = grid_props["columnCount"]
          {name, "#{title}!R1C1:R#{h}C#{w}"}
        _ ->
          :skip
      end
    end)
    |> Enum.filter(fn e -> e != :skip end)

    if length(decks) > 0 do
      query_lst = decks |> Enum.map(fn {_, rng} -> {"ranges", rng} end) |> Enum.to_list()
      qs = URI.encode_query(query_lst ++ [{"majorDimension", "COLUMNS"}])
      with {:ok, %{body: body}} <- HTTPoison.get("#{@base_url}/#{spreadsheet_id}/values:batchGet?#{qs}", auth) do
        App.Native.parse_spreadsheet(Enum.map(decks, &elem(&1, 0)), body)
      end
    else
      {:error, "No sheets named 'Deck:*'"}
    end
  end

  def get_spreadsheet(spreadsheet_id) do
    with {:ok, tkn} <- authorize() do
      auth = [{"Authorization", "Bearer #{tkn}"}]
      qs = URI.encode_query([{"fields", "properties.title,sheets.properties(sheetId,title,sheetType,gridProperties)"}])
      with {:ok, top} <- fetch_json("#{@base_url}/#{spreadsheet_id}?#{qs}", auth) do
        case top do
          %{"sheets" => sheets, "properties" => %{"title" => _title}} ->
            get_spreadsheet_values(spreadsheet_id, sheets, auth)
          %{"error" => error} ->
            :ok = Logger.warning("Google API error", response: error)
            {:error, "Google API error"}
          _ ->
            {:error, "Unknown error"}
        end
      end
    end
  end

  defp insert_deck(deck) do
    deck_changes = Map.to_list(deck)
    |> Enum.filter(&(elem(&1, 0) != :__struct__))
    deck_changeset = Ecto.Changeset.change(%Deck{}, deck_changes)
    |> delete_change(:id)
    |> Deck.validations()

    on_conflict = [
      inc: [revision: 1],
      set: [
        title: deck.title,
        image_url: deck.image_url,
        data: deck.data,
        updated_at: NaiveDateTime.utc_now(),
      ]
    ]
    Ecto.Multi.new
    |> Ecto.Multi.insert(
      :deck, deck_changeset,
      on_conflict: on_conflict,
      conflict_target: [:spreadsheet_id, :title],
      returning: [:id, :revision, :title, :image_url, :inserted_at, :updated_at]
    )
    |> Repo.transaction()
  end

  defp insert_decks([]) do
    {:ok, []}
  end
  defp insert_decks([head | tail]) do
    with {:ok, lst} <- insert_decks(tail),
         {:ok, %{deck: deck}} <- insert_deck(head) do
      {:ok, [deck | lst]}
    end
  end

  def insert(parsed_decks) do
    insert_decks(App.Native.prepare_decks(parsed_decks))
  end
end
