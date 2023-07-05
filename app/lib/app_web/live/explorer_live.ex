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

  def handle_info({:load, id}, socket) do
    socket = with {:ok, dbdeck} <- DeckService.show(id) do
      payload = case App.Native.deserialize_deck(dbdeck) do
        {:ok, deck} ->
          %{"ok" => Phoenix.View.render(AppWeb.SheetView, "deck.json", %{data: deck})}
        {:error, err} ->
          %{"error" => to_string(err)}
      end
      push_event(socket, "load", payload)
    else
      _ ->
        socket
        |> put_flash(:error, "Invalid ID #{id}")
        |> redirect(to: Routes.page_path(socket, :index))
    end

    {:noreply, socket}
  end
end
