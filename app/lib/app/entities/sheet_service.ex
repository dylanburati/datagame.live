defmodule App.Entities.SheetService do
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

  def authorize() do
    case App.Cache.lookup(@tkn_cache_key) do
      nil -> get_new_token()
      tkn -> {:ok, tkn}
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
    tag_to_pos = %{"Tag1" => 1, "Tag2" => 2, "Tag3" => 3, "Tag4" => 4}

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
    {stat_cells, cells} = Enum.zip(col_names, row)
    |> Enum.split_with(fn {nm, _} -> is_binary(nm) and starts_with?(nm, "Stat") end)

    stat_box = stat_cells
    |> Enum.map(fn {"Stat" <> which, val} ->
      {Card.key_for_stat(which), non_empty_or_nil(val)}
    end)
    |> Enum.filter(fn {k, _} -> not is_nil(k) end)
    |> Enum.reduce(%Card.CardStatBox{}, fn {k, v}, box -> Map.put(box, k, v) end)

    params = cells
    |> Enum.reduce(%{stat_box: stat_box}, fn {nm, val}, acc ->
      case nm do
        "Card" ->
          if is_binary(val) and val != "", do: Map.put(acc, :title, val), else: acc
        "Disable?" -> Map.put(acc, :is_disabled, is_binary(val) and val != "")
        "Popularity" -> Map.put(acc, :popularity_unscaled, float_or_nil(val))
        "ID" -> Map.put(acc, :unique_id, non_empty_or_nil(val))
        "Category1" -> Map.put(acc, :cat1, non_empty_or_nil(val))
        "Category2" -> Map.put(acc, :cat2, non_empty_or_nil(val))
        "Notes" -> Map.put(acc, :notes, val)
        _ -> acc
      end
    end)
    |> Map.put(:stat_box, stat_box)

    if Map.has_key?(params, :title) do
      [{params, card_tags(col_names, row)} | lst]
    else
      # skip card w/o title
      lst
    end
  end

  defp insert_deck(spreadsheet_id, sheet_name, col_metas, col_names, rows) do
    labels = Enum.map(col_metas, fn {k, v} -> {k, Map.get(v, "Label")} end)
    |> Map.new()
    axis_props = Enum.map(col_metas, fn {k, v} -> {k, Map.get(v, "Y-Axis")} end)
    |> Enum.filter(fn {_, v} -> is_binary(v) and String.length(v) end)
    |> Enum.flat_map(fn {k, v} ->
      with [_, maybe_mod, min_s, max_s] <- Regex.run(~r"([A-Za-z_][0-9A-Za-z_]*:)?(-?[0-9.]+),(-?[0-9.]+)", v),
           {amin, _} <- Float.parse(min_s),
           {amax, _} <- Float.parse(max_s) do
        mod = case maybe_mod do
          "" -> nil
          x -> String.trim_trailing(x, ":")
        end
        [{k, %{axis_mod: mod, axis_min: amin, axis_max: amax}}]
      else
        _ -> []
      end
    end)
    |> Map.new()
    nonblank_labels = Enum.filter(labels, fn {_, v} -> is_binary(v) and String.length(v) end)
    |> Map.new()
    ctdefs = for {col_name, pos} <- Enum.with_index(["Tag1", "Tag2", "Tag3", "Tag4"], 1) do
      %{position: pos, label: Map.get(nonblank_labels, col_name, col_name)}
    end

    cards_with_tags = deck_cards(col_names, rows)
    {cards, card_tags_nested} = Enum.unzip(cards_with_tags)
    card_tags_nested = Enum.map(card_tags_nested, &Enum.uniq/1)
    card_tags = Enum.concat(card_tags_nested)
    |> Enum.reduce(%{}, fn tag, tag_map ->
      Map.update(tag_map, tag, 1, &(&1 + 1))
    end)
    |> Enum.map(fn {tag, count} -> Map.put(tag, :count, count) end)

    card_stat_defs = Card.all_stat_keys()
    |> Enum.map(fn key ->
      values = Enum.map(cards, fn %{stat_box: %{^key => val}} -> val end)
      key_s = Atom.to_string(key)
      label = Map.get(labels, Card.sheet_col_for_stat(key), key_s)
      def_axis_props = Map.get(axis_props, Card.sheet_col_for_stat(key), %{})
      case Enum.find_index(values, &(not is_nil(&1))) do
        nil -> nil
        _ -> case CardStatDef.infer_type(values) do
          {:ok, stat_type} ->
            Map.merge(%{key: key_s, label: label, stat_type: stat_type}, def_axis_props)
          _ -> nil
        end
      end
    end)
    |> Enum.filter(&(not is_nil(&1)))

    card_user_ids = Enum.map(cards, &(&1.unique_id))
    |> MapSet.new()
    |> MapSet.delete(nil)
    |> Enum.to_list()
    cat1_nunique = Enum.map(cards, &(&1.cat1))
    |> MapSet.new()
    |> MapSet.delete(nil)
    |> Enum.count()

    deck_stats = %{}
    |> Map.put(:enabled_count, Enum.count(cards, &(not &1.is_disabled)))
    |> Map.put(
      :has_popularity_count,
      Enum.count(cards, &(not (&1.is_disabled or is_nil(&1.popularity_unscaled))))
    )
    |> Map.put(
      :has_id_count,
      Enum.count(cards, &(not (&1.is_disabled or is_nil(&1.unique_id))))
    )
    |> Map.put(
      :has_cat1_count,
      Enum.count(cards, &(not (&1.is_disabled or is_nil(&1.cat1))))
    )
    |> Map.put(:cat1_nunique, cat1_nunique)

    pop_series = Enum.filter(cards, &(not &1.is_disabled))
    |> Enum.map(&(&1.popularity_unscaled))
    |> Enum.filter(&is_number/1)
    |> Enum.sort(:desc)
    pop_min = List.last(pop_series)
    pop_med = median_of_sorted_list(pop_series)
    pop_max = List.first(pop_series)
    pop_range = max(pop_max - pop_min, 1.0e-6)
    relative_med = (pop_med - pop_min) / pop_range
    curve_factor = cond do
      relative_med > 0 and relative_med < 1 -> -1.0 / :math.log2(relative_med)
      true -> 1.0
    end
    cards = Enum.map(cards, fn c ->
      normalized = case c.popularity_unscaled do
        nil -> 0
        _ -> (c.popularity_unscaled - pop_min) / pop_range
      end
      Map.put(c, :popularity, :math.pow(normalized, curve_factor))
    end)

    deck_changeset = %Deck{}
    |> change(deck_stats)
    |> change(%{
      spreadsheet_id: spreadsheet_id,
      sheet_name: sheet_name,
      category_label: Map.get(nonblank_labels, "Category1", "Category"),
      title: sheet_name |> replace("Deck:", "", global: false) |> replace(":", " / "),
    })
    |> Deck.validations()

    Ecto.Multi.new
    |> Ecto.Multi.insert(
      :deck, deck_changeset,
      on_conflict: {:replace_all_except, [:id, :inserted_at]},
      conflict_target: [:spreadsheet_id, :sheet_name]
    )
    |> Ecto.Multi.delete_all(
      :removed_card_stat_defs, fn %{deck: deck} ->
        kept = Enum.map(card_stat_defs, &(&1.key))
        from csd in CardStatDef,
          where: csd.deck_id == ^deck.id,
          where: not (csd.key in ^kept)
      end
    )
    |> Ecto.Multi.insert_all(
      :card_stat_def, CardStatDef, fn %{deck: deck} ->
        card_stat_defs
        |> Enum.map(fn df -> Map.put(df, :deck_id, deck.id) |> add_timestamps() end)
      end,
      on_conflict: {:replace_all_except, [:id, :inserted_at]},
      conflict_target: [:deck_id, :key]
    )
    |> Ecto.Multi.delete_all(
      :removed_card_tags, fn %{deck: deck} ->
        from ct in CardTag,
          join: df in assoc(ct, :definition),
          where: df.deck_id == ^deck.id
      end
    )
    |> Ecto.Multi.insert_all(
      :card_tag_defs,
      CardTagDef,
      fn %{deck: deck} ->
        Enum.map(ctdefs, &(Map.put(&1, :deck_id, deck.id) |> add_timestamps()))
      end,
      on_conflict: {:replace_all_except, [:id, :inserted_at]},
      conflict_target: [:deck_id, :position],
      returning: [:id]
    )
    |> Ecto.Multi.delete_all(
      :removed_cards,
      fn %{deck: deck} -> from c in Card,
        where: c.deck_id == ^deck.id,
        where: is_nil(c.unique_id) or not (c.unique_id in ^card_user_ids)
      end
    )
    |> Ecto.Multi.run(
      :cards,
      fn repo, %{deck: deck} ->
        db_cards = Enum.map(cards, &(Map.put(&1, :deck_id, deck.id)))
        |> Enum.chunk_every(5000)
        |> Enum.map(fn lst ->
          repo.insert_all(
            Card,
            Enum.map(lst, &add_timestamps/1),
            returning: [:id],
            on_conflict: {:replace_all_except, [:id, :inserted_at]},
            conflict_target: [:deck_id, :unique_id]
          )
        end)
        |> Enum.map(fn {_ct, rows} -> rows end)
        |> Enum.concat()
        {:ok, db_cards}
      end
    )
    |> Ecto.Multi.run(
      :card_tags,
      fn repo, %{cards: db_cards, card_tag_defs: {_, db_tag_defs}} ->
        pos_map = for {ctdef, %{id: id}} <- Enum.zip(ctdefs, db_tag_defs), into: %{} do
          {ctdef.position, id}
        end
        db_tags = card_tags |> Enum.map(fn tag -> Map.put(tag, :id, Ecto.UUID.generate()) end)
        {:ok, tag_io} = db_tags
        |> Enum.map(fn tag ->
          [
            tag.id,
            tag.value,
            Integer.to_string(tag.count),
            Integer.to_string(pos_map[tag.position])  # card_tag_def_id
          ]
        end)
        |> CSV.encode(separator: ?\t)
        |> Enum.join("")
        |> StringIO.open()
        tag_stream = Ecto.Adapters.SQL.stream(repo,
          "COPY card_tag (id, value, count, card_tag_def_id) FROM STDIN")
        repo.checkout(fn -> IO.binstream(tag_io, 64 * 1024) |> Enum.into(tag_stream) end)

        tag_id_map = for tag = %{id: id} <- db_tags, into: %{} do
          {Map.take(tag, [:position, :value]), id}
        end
        {:ok, assoc_io} = Enum.zip(db_cards, card_tags_nested)
        |> Enum.flat_map(fn {%{id: card_id}, tag_lst} ->
          Enum.map(tag_lst, fn tag ->
            [card_id, tag_id_map[tag]]
          end)
        end)
        |> CSV.encode(separator: ?\t)
        |> Enum.join("")
        |> StringIO.open()
        assoc_stream = Ecto.Adapters.SQL.stream(repo,
          "COPY card_card_tag (card_id, card_tag_id) FROM STDIN")
        repo.checkout(fn -> IO.binstream(assoc_io, 64 * 1024) |> Enum.into(assoc_stream) end)
        {:ok, nil}
      end
    )
    |> Repo.transaction()
  end

  def insert_sheet_decks(_, []) do
    {:ok, [], []}
  end

  def insert_sheet_decks(spreadsheet_id, [draft_deck | tail]) do
    with {:ok, lst, fails} <- insert_sheet_decks(spreadsheet_id, tail) do
      with %{"title" => sheet_name, "values" => values} <- draft_deck do
        with [col_names | rows] <- transpose(values) do
          with 1 <- Enum.count(col_names, &(&1 == "Card")) do
            meta_loc = Enum.zip(col_names, Enum.drop(col_names, 1))
            |> Enum.find_index(fn pair -> pair == {"Column", "Label"} end)
            col_metas = case meta_loc do
              nil -> %{}
              idx ->
                headers_after_loc = Enum.drop(col_names, meta_loc + 1)
                |> Enum.take_while(&(not is_nil(&1)))

                Enum.map(rows, fn row -> Enum.drop(row, idx) end)
                |> Enum.filter(fn [k | _] -> not is_nil(k) end)
                |> Map.new(fn [k | rest] ->
                  value = Enum.zip(headers_after_loc, rest) |> Map.new()
                  {k, value}
                end)
            end
            with {:ok, %{deck: deck}} <- insert_deck(spreadsheet_id, sheet_name, col_metas, col_names, rows) do
              {:ok, [deck | lst], fails}
            else
              {:error, other, other_value, _} ->
                IO.inspect(other_value)
                IO.inspect(other)
                {:error, "Unknown error"}
            end
          else
            0 -> {:ok, lst, [{spreadsheet_id, sheet_name, "No column named 'Card' in #{sheet_name}"} | fails]}
            _ -> {:ok, lst, [{spreadsheet_id, sheet_name, "Multiple columns named 'Card' in #{sheet_name}"} | fails]}
          end
        end
      end
    end
  end
end
