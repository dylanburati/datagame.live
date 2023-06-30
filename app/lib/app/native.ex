defmodule App.Native do
  use Rustler,
    otp_app: :app,
    crate: "app_native",
    path: Path.expand(Path.join(__DIR__, "../../native/app_native"))

  def parse_spreadsheet(_sheet_names, _json), do: :erlang.nif_error(:nif_not_loaded)

  def prepare_decks(_decks), do: :erlang.nif_error(:nif_not_loaded)
end
