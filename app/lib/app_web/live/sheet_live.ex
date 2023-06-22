defmodule AppWeb.SheetLive do
  use AppWeb, :live_view

  alias App.Entities.SheetService

  def mount(params = %{"id" => id}, _session, socket) do
    if connected?(socket) do
      Process.send(self(), {:load, id}, [])
    end
    socket = assign(socket, %{
      params: params,
      body_class: "fluid",
      main_class: "flex flex-col viewport-minus-55px"
    })
    {:ok, push_event(socket, "mount", %{})}
  end

  def handle_event("refresh", _event_params, socket) do
    Process.send(self(), {:load, socket.assigns.params["id"]}, [])
    {:noreply, socket}
  end

  def handle_event("publish", _event_params, socket) do
    case Map.get(socket.assigns, :decks) do
      {:ok, decks} ->
        App.Native.persist_decks(decks)
        {:noreply, push_event(socket, "publish-result", %{ok: true})}
      {:error, titles} ->
        {:noreply, push_event(socket, "publish-result", %{error: "Fixes needed in: #{Enum.join(titles, ", ")}"})}
      _ ->
        {:noreply, push_event(socket, "publish-result", %{error: "Not loaded"})}
    end
  end

  def handle_event("refresh", _event_params, socket) do
    Process.send(self(), {:load, socket.assigns.params["id"]}, [])
    {:noreply, socket}
  end

  defp publishable_recur([]), do: {:ok, []}
  defp publishable_recur([deck_plus | rest]) do
    %{deck: deck, callouts: callouts} = deck_plus
    errors = Enum.filter(callouts, fn
      {:error, _} -> true
      _ -> false
    end)
    |> Enum.map(&elem(&1, 1))
    case publishable_recur(rest) do
      {:ok, lst} ->
        if Enum.empty?(errors) do
          {:ok, [deck | lst]}
        else
          {:error, [deck.title]}
        end
      {:error, lst} ->
        if Enum.empty?(errors) do
          {:error, lst}
        else
          {:error, [deck.title | lst]}
        end
    end
  end

  def handle_info({:load, id}, socket) do
    {socket, payload} = if id == "dev" do
      case App.Native.parse_spreadsheet(["Movies", "Animals", "Music:Billboard US", "The Rich and Famous", "Places", "Characters"], File.read!("1687079970025835_in.json")) do
        {:ok, decks_plus} ->
          {assign(socket, decks: publishable_recur(decks_plus)),
            %{"ok" => Phoenix.View.render(AppWeb.SheetView, "sheet_.json", %{data: decks_plus})}}
        {:error, err} ->
          {socket,
            %{"error" => to_string(err)}}
      end
    else
      case SheetService.get_spreadsheet_(id) do
        {:ok, decks_plus} ->
          {assign(socket, decks: publishable_recur(decks_plus)),
            %{"ok" => Phoenix.View.render(AppWeb.SheetView, "sheet_.json", %{data: decks_plus})}}
        {:error, err} ->
          {socket,
            %{"error" => to_string(err)}}
      end
    end

    {:noreply, push_event(socket, "load", payload)}
  end
end
