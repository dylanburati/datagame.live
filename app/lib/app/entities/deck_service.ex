defmodule App.Entities.DeckService do
  import Ecto.Query

  alias App.Repo
  alias App.Entities.Deck

  @spec list() :: [Deck.t]
  @doc """
  Lists the Decks in the database.
  """
  def list() do
    query = from Deck,
      order_by: :id,
      select: [:id, :revision, :title, :image_url, :inserted_at, :updated_at]
    Repo.all(query)
  end

  @spec show(id :: integer) :: {:ok, Deck.t} | {:error, String.t}
  @doc """
  Gets a `Deck` by ID, and loads the fields necessary for a detailed view.
  """
  def show(id) do
    case Repo.get(Deck, id) do
      nil -> {:error, "Invalid ID #{id}"}
      deck ->
        # deck = deck
        # |> fill_out_category_counts()
        # |> Repo.preload([card_tag_defs: [tags: from(ct in CardTag, order_by: [desc: ct.count])]])
        # |> fill_out_value_counts()
        {:ok, deck}
    end
  end

  @spec show!(id :: integer) :: Deck.t
  @doc """
  Gets a `Deck` by ID, and loads the fields necessary for a detailed view. Raises
  `KeyError` if the ID is not found.
  """
  def show!(id) do
    case show(id) do
      {:ok, result} -> result
      {:error, reason} -> raise KeyError, message: reason
    end
  end

  # Update related entities all at once

  # defp resolve_reference(deck, %{"entity" => "Pairing", "selector" => props}) do
  #   Enum.find(deck.pairings, fn p -> Map.take(p, Map.keys(props)) == props end)
  # end
  # defp resolve_reference(deck, %{"entity" => "CardStatDef", "selector" => props}) do
  #   Enum.find(deck.card_stat_defs, fn d -> Map.take(d, Map.keys(props)) == props end)
  # end
  # defp resolve_reference(deck, %{"entity" => "CardTagDef", "selector" => props}) do
  #   Enum.find(deck.card_tag_defs, fn d -> Map.take(d, Map.keys(props)) == props end)
  # end
  # defp resolve_reference(_deck, _), do: nil

  # defp cast_with_references(holder, map, permitted, deck, refs) do
  #   {ref_entries, cast_entries} = Enum.split_with(map, fn {_, v} ->
  #     is_binary(v) and String.starts_with?(v, "${") and String.ends_with?(v, "}")
  #   end)
  #   changeset = cast(holder, Map.new(cast_entries), permitted)
  #   Enum.reduce(ref_entries, changeset, fn {kstr, v}, cset ->
  #     k = String.to_atom(kstr)
  #     refname = String.slice(v, 2..-2)
  #     put_change(cset, k, resolve_reference(deck, Map.get(refs, refname)))
  #   end)
  # end

  # defp update_pairings(deck, pairings, refs) do
  #   ins_opts = [
  #     on_conflict: {:replace_all_except, [:id, :inserted_at]},
  #     conflict_target: [:deck_id, :name]
  #   ]

  #   {ok_inserts, err_inserts} = pairings
  #   |> Enum.map(&cast_with_references(%Pairing{}, &1, [:criteria, :name], deck, refs))
  #   |> Enum.map(&change(&1, %{deck: deck}))
  #   |> Enum.map(&Repo.insert(&1, ins_opts))
  #   |> Enum.split_with(
  #     fn {:ok, _} -> true; {:error, _} -> false end
  #   )

  #   db_pairings = ok_inserts |> Enum.map(&elem(&1, 1))
  #   error_messages = err_inserts |> Enum.map(fn {_, cset} ->
  #     changeset_error_strings(cset.errors)
  #   end)

  #   if Enum.empty?(error_messages) do
  #     {:ok, Map.put(deck, :pairings, db_pairings)}
  #   else
  #     {:error, Map.put(deck, :pairings, db_pairings), error_messages}
  #   end
  # end

  # defp update_trivia_defs(deck, trivia_defs, refs) do
  #   ins_opts = [
  #     on_conflict: {:replace_all_except, [:id, :inserted_at]},
  #     conflict_target: [:deck_id, :question_format]
  #   ]
  #   permitted = [
  #     :question_format, :question_source, :option_source,
  #     :selection_min_true, :selection_max_true,
  #     :selection_length, :selection_compare_type, :answer_type,
  #     :question_difficulty, :question_pairing_subset,
  #     :option_difficulty, :option_format_separator
  #   ]

  #   {ok_inserts, err_inserts} = trivia_defs
  #   |> Enum.map(&cast_with_references(%TriviaDef{}, &1, permitted, deck, refs))
  #   |> Enum.map(&change(&1, %{deck: deck}))
  #   |> Enum.map(&TriviaDef.validations/1)
  #   |> Enum.map(&Repo.insert(&1, ins_opts))
  #   |> Enum.split_with(
  #     fn {:ok, _} -> true; {:error, _} -> false end
  #   )

  #   db_pairings = ok_inserts |> Enum.map(&elem(&1, 1))
  #   error_messages = err_inserts |> Enum.map(fn {_, cset} ->
  #     changeset_error_strings(cset.errors)
  #   end)

  #   if Enum.empty?(error_messages) do
  #     {:ok, Map.put(deck, :pairings, db_pairings)}
  #   else
  #     {:error, Map.put(deck, :pairings, db_pairings), error_messages}
  #   end
  # end

  # defp update_image_props(deck, image_props) do
  #   cast(deck, image_props, [:image_url, :image_dominant_color])
  #   |> Repo.update()
  # end

  # @typedoc """
  # An update to be applied to a Deck. Encompasses all aspects of the Deck
  # that can't be imported from a spreadsheet.

  # ```typescript
  # type DeckUpdate {
  #   references: {
  #     [r: string]: {
  #       entity: "Pairing" | "CardTagDef" | "CardStatDef";
  #       selector: Record<string, any>;
  #     }
  #   };
  #   image: {
  #     image_url: string;
  #     image_dominant_color: string;
  #   };
  #   pairings: {
  #     name: string;
  #     criteria: {
  #       filter: string[][];
  #       boost?: string[][];
  #       agg?: Record<string, string>;
  #     }
  #   }[];
  #   trivia_defs: Record<string, any>[];
  # }
  # ```
  # """
  # @type deck_update :: map

  # @spec update(id :: integer, params :: deck_update) :: {:ok, Deck.t} | {:error, String.t} | {:error, Deck.t, [String.t]}
  # @doc """
  # Updates a deck with new pairings and trivia defs, and a new image.
  # """
  # def update(
  #   id,
  #   %{"references" => refs,
  #     "pairings" => pairings,
  #     "trivia_defs" => trivia_defs,
  #     "image" => image_props}
  # ) when is_map(refs)
  #     and is_list(pairings)
  #     and is_list(trivia_defs)
  #     and is_map(image_props)
  # do
  #   refs_elixir = Enum.map(refs, fn {k, v = %{"selector" => selector_json}} ->
  #     selector = selector_json
  #     |> Enum.map(fn {sk, sv} -> {String.to_atom(sk), sv} end)
  #     |> Map.new()
  #     {k, Map.put(v, "selector", selector)}
  #   end)
  #   |> Map.new()

  #   with (deck0 = %Deck{}) <- Repo.get(Deck, id) do
  #     init_deck = Repo.preload(deck0, [:pairings, :card_tag_defs, :card_stat_defs])
  #     with {:ok, deck1} <- update_pairings(init_deck, pairings, refs_elixir),
  #          {:ok, deck2} <- update_trivia_defs(deck1, trivia_defs, refs_elixir),
  #          {:ok, deck} <- update_image_props(deck2, image_props) do
  #       {:ok, deck}
  #     end
  #   else
  #     _ -> {:error, "Deck not found"}
  #   end
  # end

  # def update_deck(_, _), do: {:error, "Unexpected type in inputs"}
end
