defmodule AppWeb.ExplorerLive do
  use AppWeb, :live_view

  alias App.Entities.DeckService

  def mount(params = %{"id" => id_str}, _session, socket) do
    with {id, ""} <- Integer.parse(id_str) do
      if connected?(socket) do
        Process.send(self(), {:load, id}, [])
      end
      socket = assign(socket, %{
        params: params,
        body_class: "fluid",
        main_class: "flex flex-col viewport-minus-55px"
      })
      {:ok, push_event(socket, "mount", %{})}
    else
      _ ->
        socket = socket
        |> put_flash(:error, "Invalid ID #{id_str}")
        |> redirect(to: Routes.page_path(socket, :index))
        {:ok, socket}
    end
  end

  def handle_event("refresh", _event_params, socket) do
    Process.send(self(), {:load, socket.assigns.params["id"]}, [])
    {:noreply, socket}
  end

  def handle_event("trivia", _event_params, socket) do
    case Map.get(socket.assigns, :trivia_base) do
      {kb, tdefs} ->
        payload = case get_trivia(socket, kb, tdefs) do
          {:ok, trv, exps} ->
            json = Phoenix.View.render(AppWeb.TriviaView, "trivia_explore.json", %{trivia: trv, expectations: exps})
            %{ok: json}
          {:error, msg} ->
            %{error: msg}
        end
        {:noreply, push_event(socket, "trivia-result", payload)}
      _ ->
        {:noreply, push_event(socket, "trivia-result", %{error: "Not loaded"})}
    end
  end

  defp get_trivia(socket, kb, tdefs) do
    deck_tdef_ids = Enum.with_index(tdefs)
    |> Enum.filter(fn {td, _} -> Integer.to_string(td.deck_id) == socket.assigns.params["id"] end)
    |> Enum.map(&elem(&1, 1))
    case deck_tdef_ids do
      [] -> {:error, "No trivia defs in deck"}
      lst -> App.Native.get_trivia(kb, Enum.at(lst, :rand.uniform(length(lst)) - 1))
    end
  end

  def handle_info({:load, id}, socket) do
    socket = with {:ok, dbdeck} <- DeckService.show(id) do
      with {:ok, deck} <- App.Native.deserialize_deck(dbdeck),
           {:ok, kb, tdefs} <- App.Native.cached_trivia_base() do
        deck_json = Phoenix.View.render(AppWeb.SheetView, "deck.json", deck)
        socket
        |> assign(:trivia_base, {kb, tdefs})
        |> push_event("load", %{"ok" => deck_json})
      else
        {:error, err} -> push_event(socket, "load", %{"error" => to_string(err)})
      end
    else
      _ ->
        socket
        |> put_flash(:error, "Invalid ID #{id}")
        |> redirect(to: Routes.page_path(socket, :index))
    end

    {:noreply, socket}
  end
end
