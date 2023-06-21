defmodule AppWeb.SheetLive do
  # use AppWeb, :live_view
  use Phoenix.LiveView

  def render(assigns) do
    Phoenix.View.render(AppWeb.PageView, "sheet.html", assigns)
  end

  def mount(%{id: id}, session, socket) do
    if connected?(socket) do
      Process.send(self(), {:load, id}, [])
    end


  end
end
