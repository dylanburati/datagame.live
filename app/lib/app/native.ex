defmodule App.Native do
  alias App.Entities.Deck

  use Rustler,
    otp_app: :app,
    crate: "app_native",
    path: Path.expand(Path.join(__DIR__, "../../native/app_native"))

  def parse_spreadsheet(_sheet_names, _json), do: :erlang.nif_error(:nif_not_loaded)

  def prepare_decks(_decks), do: :erlang.nif_error(:nif_not_loaded)

  def deserialize_deck(_deck), do: :erlang.nif_error(:nif_not_loaded)

  def load_trivia_base(_decks), do: :erlang.nif_error(:nif_not_loaded)

  defp decks_revisions() do
    case App.Cache.lookup("deck_revisions") do
      nil ->
        decks = App.Repo.all(Deck)
        revisions = Map.new(decks, fn d -> {d.id, d.revision} end)
        :ok = App.Cache.insert_with_ttl("deck_revisions", revisions, 5)
        {decks, revisions}
      stored ->
        {nil, stored}
    end
  end

  def cached_trivia_base() do
    {mb_decks, revisions} = decks_revisions()
    {_, res} = App.Cache.m_update("trivia_base", fn value ->
      case value do
        {:ok, {^revisions, {:ok, kb, deck_details}}} ->
          {revisions, {:ok, kb, deck_details}}
        other ->
          decks = mb_decks || App.Repo.all(Deck)
          inner = App.Native.load_trivia_base(decks)
          {revisions, inner}
      end
    end)
    res
  end

  def get_trivia(_kb, _def_id), do: :erlang.nif_error(:nif_not_loaded)

  def get_cards(_kb, _deck_id, _difficulty, _category_boosts, _limit) do
    :erlang.nif_error(:nif_not_loaded)
  end
end
