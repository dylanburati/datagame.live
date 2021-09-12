defmodule App.Entities.SheetService do
  alias App.GToken

  @base_url "https://sheets.googleapis.com/v4/spreadsheets"
  @tkn_cache_key "App.Entities.SheetService.access_token"

  defp post_fetch_json(url, body, headers \\ %{}) do
    with {:ok, %{body: body}} <- HTTPoison.post(url, body, headers) do
      Poison.decode(body)
    end
  end

  defp fetch_json(url, headers \\ %{}) do
    with {:ok, %{body: body}} <- HTTPoison.get(url, headers) do
      Poison.decode(body)
    end
  end

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
      t0 = System.system_time(:second)
      :ets.insert(:app_cache, {@tkn_cache_key, tkn, t0 + data["expires_in"]})
      IO.puts "New Google access token"
      {:ok, tkn}
    end
  end

  def authorize() do
    t0 = System.system_time(:second)
    case :ets.lookup(:app_cache, @tkn_cache_key) do
      [{@tkn_cache_key, tkn, exp}] when exp > t0 + 3 ->
        {:ok, tkn}
      other ->
        IO.inspect other
        get_new_token()
    end
  end

  defp full_sheet_range(%{"gridProperties" => shape, "title" => title}) do
    %{"columnCount" => cols, "rowCount" => rows} = shape
    "#{title}!R1C1:R#{rows}C#{cols}"
  end

  defp get_spreadsheet_values(spreadsheet_id, sheets, auth) do
    decks = sheets
    |> Enum.map(fn item -> item["properties"] end)
    |> Enum.filter(fn %{"title" => title} -> String.starts_with?(title, "Deck:") end)

    if length(decks) > 0 do
      sheet_ranges = decks |> Enum.map(&full_sheet_range/1)
      query_lst = sheet_ranges |> Enum.map(fn rng -> {"ranges", rng} end) |> Enum.to_list()
      qs = URI.encode_query(query_lst ++ [{"majorDimension", "COLUMNS"}])
      with {:ok, range_data} <- fetch_json("#{@base_url}/#{spreadsheet_id}/values:batchGet?#{qs}", auth) do
        with %{"valueRanges" => ranges} <- range_data do
          deck_vals = Enum.zip(ranges, decks)
          |> Enum.map(fn {%{"values" => values}, %{"title" => title}} ->
            %{"title" => title, "values" => values}
          end)

          {:ok, range_data
          |> Map.delete("valueRanges")
          |> Map.put("decks", deck_vals)}
        end
      end
    else
      {:error, "No sheets named 'Deck:*'"}
    end
  end

  def get_spreadsheet(spreadsheet_id) do
    with {:ok, tkn} <- authorize() do
      auth = [{"Authorization", "Bearer #{tkn}"}]
      with {:ok, top} <- fetch_json("#{@base_url}/#{spreadsheet_id}", auth) do
        case top do
          %{"sheets" => sheets, "properties" => %{"title" => title}} ->
            with {:ok, sheet_range_data} <- get_spreadsheet_values(spreadsheet_id, sheets, auth) do
              {:ok, Map.put(sheet_range_data, "title", title)}
            end
          %{"error" => %{"message" => err}} ->
            {:error, err}
          _ ->
            {:error, "Unknown error"}
        end
      end
    end
  end
end
