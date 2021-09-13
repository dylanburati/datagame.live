defmodule AppWeb.GameController do
  use AppWeb, :controller

  import App.Utils
  alias App.Entities.GameService

  def new_game(conn, params = %{"id" => id}) do
    IO.inspect(params)
    din = Map.get(params, "difficulty", 0)
    diff_lvl = cond do
      is_number(din) -> din
      is_binary(din) -> float_or_nil(din)
      true -> nil
    end
    unless is_nil(diff_lvl) do
      case GameService.get_cards(id, diff_lvl, 40) do
        {:ok, %{deck: deck, cards: cards}} ->
          render(conn, "game.json", %{deck: deck, cards: cards})
        {:error, err} ->
          conn |> put_status(400) |> json(%{"error" => to_string(err)})
      end
    else
      conn |> put_status(400) |> json(%{"error" => "Could not understand difficulty #{}"})
    end
  end
end
