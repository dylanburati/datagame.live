defmodule App.GToken do
  use Joken.Config, default_signer: :googlesheets

  @impl Joken.Config
  def token_config do
    client_email = Application.fetch_env!(:app, :googlesheets)[:client_email]
    token_url = "https://www.googleapis.com/oauth2/v4/token"

    default_claims(default_exp: 60 * 60)
    |> add_claim("iss", fn -> client_email end, &(&1 == client_email))
    |> add_claim("aud", fn -> token_url end, &(&1 == token_url))
  end
end
