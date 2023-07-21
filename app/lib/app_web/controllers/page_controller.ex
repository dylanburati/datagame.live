defmodule AppWeb.PageController do
  use AppWeb, :controller

  alias App.Entities.User
  alias App.Entities.DeckService

  def index(conn, _params) do
    render(conn, "index.html", decks: DeckService.list(), changeset: Ecto.Changeset.change(%User{}))
  end
end
