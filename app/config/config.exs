# This file is responsible for configuring your application
# and its dependencies with the aid of the Mix.Config module.
#
# This configuration file is loaded before any dependency and
# is restricted to this project.

# General application configuration
use Mix.Config

config :app,
  ecto_repos: [App.Repo]

# Configures the endpoint
config :app, AppWeb.Endpoint,
  url: [host: "localhost"],
  secret_key_base: "PI3CGmeNzA2PnIQf+/PisqzIY+k0YopE/1dEUq5wZni3kDJgmTvBoiEM6Qloo6Jb",
  render_errors: [view: AppWeb.ErrorView, accepts: ~w(html json), layout: false],
  pubsub_server: App.PubSub,
  live_view: [signing_salt: "tMD5edqK"]

# Configures Elixir's Logger
config :logger, :console,
  format: "$time $metadata[$level] $message\n",
  metadata: [:request_id]

# Use Jason for JSON parsing in Phoenix
config :phoenix, :json_library, Jason

if Mix.env() != :test do
  config :app, :googlesheets,
    client_email: System.get_env("GOOGLEAUTH_CLIENT_EMAIL") ||
      raise "GOOGLEAUTH_CLIENT_EMAIL is missing"

  config :joken,
    googlesheets: [
      signer_alg: "RS256",
      key_pem: System.get_env("GOOGLEAUTH_PRIVATE_KEY")
    ]

  config :app, :admin,
    hashed_pw_salt: "xNAZFMjH",
    hashed_pw: System.get_env("DATAGAME_ADMIN_PW") || raise "DATAGAME_ADMIN_PW is missing"
end

# Import environment specific config. This must remain at the bottom
# of this file so it overrides the configuration defined above.
import_config "#{Mix.env()}.exs"
