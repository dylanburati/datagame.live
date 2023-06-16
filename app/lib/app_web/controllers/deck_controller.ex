defmodule AppWeb.DeckController do
  use AppWeb, :controller
  alias App.Entities.DeckService

  def index(conn, _params) do
    render(conn, "decks.json", %{decks: DeckService.list()})
  end

  def show(conn, %{"id" => id}) do
    case DeckService.show(id) do
      {:ok, deck} -> render(conn, "deck.json", %{deck: deck})
      {:error, err} -> conn |> put_status(400) |> json(%{"error" => to_string(err)})
    end
  end

  defp dumb_pw_hash(str) do
    %{hashed_pw: hashed_pw, hashed_pw_salt: salt} = Map.new(Application.fetch_env!(:app, :admin))
    case Base.encode64(:crypto.hash(:sha256, str <> salt) <>
                       :crypto.hash(:sha256, str <> salt <> "\0")) do
      ^hashed_pw -> :ok
      _ -> :error
    end
  end

  def update(conn, %{"id" => id, "password" => pw, "content" => params}) do
    with :ok <- dumb_pw_hash(pw) do
      params_full = params
      |> Map.put_new("references", %{})
      |> Map.put_new("pairings", [])
      |> Map.put_new("trivia_defs", [])
      |> Map.put_new("image", %{})

      case DeckService.update(id, params_full) do
        {:ok, deck} -> render(conn, "deck.json", %{deck: deck})
        {:error, err} -> conn |> put_status(400) |> json(%{"error" => to_string(err)})
        {:error, _, err} -> conn |> put_status(400) |> json(%{"error" => to_string(err)})
      end
    else
      _ -> conn |> put_status(403) |> json(%{"error" => "Forbidden"})
    end
  end

  def update(conn, _params) do
    conn |> put_status(400) |> json(%{"error" => "ID, password, and content are required"})
  end
end
