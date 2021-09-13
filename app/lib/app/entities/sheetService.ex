defmodule App.Entities.SheetService do
  import String, except: [length: 1]
  import Ecto.Changeset
  import App.Utils

  alias App.GToken
  alias App.Repo
  alias App.Entities.Deck
  alias App.Entities.Card
  alias App.Entities.CardTagDef
  alias App.Entities.CardTag

  @base_url "https://sheets.googleapis.com/v4/spreadsheets"
  @tkn_cache_key "App.Entities.SheetService.access_token"

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
    |> Enum.filter(fn %{"title" => title} -> starts_with?(title, "Deck:") end)

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

  defp card_tags(col_names, row) do
    tag_to_pos = %{"Tag2" => 2, "Tag3" => 3, "Tag4" => 4}

    Enum.zip(col_names, row)
    |> Enum.flat_map(fn {nm, maybe_val} ->
      case {Map.get(tag_to_pos, nm), maybe_val} do
        {nil, _} -> []
        {_, nil} -> []
        {pos, val} ->
          for tag <- Regex.split(~r/\s*,\s*/, val, trim: true), do: %{position: pos, value: tag}
      end
    end)
  end

  defp deck_cards(_col_names, []) do
    []
  end

  defp deck_cards(col_names, [row | remaining]) do
    lst = deck_cards(col_names, remaining)
    params = for {nm, val} <- Enum.zip(col_names, row), into: %{} do
      case nm do
        "Card" -> {:title, val}
        "Disable?" -> {:is_disabled, val != ""}
        "Popularity" -> {:popularity, float_or_nil(val)}
        "ID" -> {:unique_id, val}
        "Tag1" -> {:tag1, val}
        "Notes" -> {:notes, val}
        _ -> {:unused, nil}
      end
    end

    if Map.has_key?(params, :title) do
      [{Map.delete(params, :unused), card_tags(col_names, row)} | lst]
    else
      # skip card w/o title
      lst
    end
  end

  defp insert_deck(spreadsheet_id, title, labels, col_names, rows) do
    deck_changeset = %Deck{}
    |> change(%{
      spreadsheet_id: spreadsheet_id,
      title: title |> replace("Deck:", "", global: false) |> replace(":", " / "),
      category_label: Map.get(labels, "Tag1", "Category"),
    })
    |> validate_required([:title, :spreadsheet_id, :category_label])
    |> unique_constraint([:title, :spreadsheet_id])

    ctdefs = for {col_name, pos} <- Enum.with_index(["Tag2", "Tag3", "Tag4"], 2) do
      %{position: pos, label: Map.get(labels, col_name, col_name)}
    end

    {cards, card_tags} = Enum.unzip(deck_cards(col_names, rows))

    Ecto.Multi.new
    |> Ecto.Multi.insert(:deck, deck_changeset)
    |> Ecto.Multi.insert_all(:card_tag_defs, CardTagDef, fn %{deck: deck} ->
      Enum.map(ctdefs, &(Map.put(&1, :deck_id, deck.id) |> add_timestamps()))
    end)
    |> Ecto.Multi.insert_all(
      :cards,
      Card,
      fn %{deck: deck} -> Enum.map(cards, &(Map.put(&1, :deck_id, deck.id) |> add_timestamps())) end,
      [returning: true]
    )
    |> Ecto.Multi.insert_all(:card_tags, CardTag, fn %{cards: {_, dbcards}} ->
      Enum.zip(dbcards, card_tags)
      |> Enum.flat_map(fn {c, ctag_lst} ->
        for ctag <- ctag_lst, do: Map.put(ctag, :card_id, c.id) |> add_timestamps()
      end)
    end)
    |> Repo.transaction()
  end

  def insert_sheet_decks(_, []) do
    {:ok, [], []}
  end

  def insert_sheet_decks(spreadsheet_id, [draft_deck | tail]) do
    with {:ok, lst, fails} <- insert_sheet_decks(spreadsheet_id, tail) do
      with %{"title" => title, "values" => values} <- draft_deck do
        with [col_names | rows] <- transpose(values) do
          with 1 <- Enum.count(col_names, &(&1 == "Card")) do
            label_loc = Enum.zip(col_names, Enum.drop(col_names, 1))
            |> Enum.find_index(fn pair -> pair == {"Column", "Label"} end)
            labels = case label_loc do
              nil -> %{}
              idx ->
                Enum.map(rows, fn row -> Enum.drop(row, idx) |> Enum.take(2) end)
                |> Enum.filter(fn [a, b] -> not (is_nil(a) and is_nil(b)) end)
                |> Enum.reduce(%{}, fn [k, lbl], acc -> Map.put(acc, k, lbl) end)
            end
            with {:ok, %{deck: deck, cards: {_, cards}}} <- insert_deck(spreadsheet_id, title, labels, col_names, rows) do
              {:ok, [%{deck | cards: cards} | lst], fails}
            else
              {:error, :deck, changeset, _} ->
                case Keyword.get(changeset.errors, :title) do
                  {"has already been taken", _} ->
                    {:ok, lst, [{spreadsheet_id, title, "Already exists"} | fails]}
                  _ ->
                    {:ok,
                     lst,
                     [{spreadsheet_id, title, changeset_error_strings(changeset.errors) |> Enum.join(". ")}
                      | fails]}
                end
              {:error, other, other_value, _} ->
                IO.inspect(other_value)
                IO.inspect(other)
                {:error, "Unknown error"}
            end
          else
            0 -> {:ok, lst, [{spreadsheet_id, title, "No column named 'Card' in #{title}"} | fails]}
            _ -> {:ok, lst, [{spreadsheet_id, title, "Multiple columns named 'Card' in #{title}"} | fails]}
          end
        end
      end
    end
  end
end
