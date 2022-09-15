defmodule AppWeb.GameController do
  use AppWeb, :controller

  import App.Utils
  alias App.Entities.GameService

  def new_game(conn, params = %{"id" => id}) do
    din = Map.get(params, "difficulty", 0)
    diff_lvl = cond do
      is_number(din) -> din
      is_binary(din) -> float_or_nil(din)
      true -> nil
    end
    boosts_s = Map.get(params, "categoryFreqs", "")
    boosts_l = String.split(boosts_s, ",")
    boosts = case rem(length(boosts_l), 2) do
      1 -> []
      0 ->
        chunked = boosts_l
        |> Enum.chunk_every(2)
        |> Enum.map(fn [a, b] -> {String.trim(a), float_or_nil(b)} end)
        case chunked |> Enum.all?(fn {a, b} -> a != "" and is_number(b) end) do
          true -> chunked
          false -> []
        end
    end

    unless is_nil(diff_lvl) do
      case GameService.get_cards(id, diff_lvl, boosts, 40) do
        {:ok, %{deck: deck, cards: cards}} ->
          render(conn, "game.json", %{deck: deck, cards: cards})
        {:error, err} ->
          conn |> put_status(400) |> json(%{"error" => to_string(err)})
      end
    else
      conn |> put_status(400) |> json(%{"error" => "Could not understand difficulty #{din}"})
    end
  end
end
