defmodule App.UserToken do
  use Joken.Config

  @impl true
  def token_config do
    default_claims(default_exp: 10 * 24 * 60 * 60)
    |> add_claim("sub", nil, fn _ -> true end)
  end
end
