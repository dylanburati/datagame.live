defmodule AppWeb.SheetController do
  use AppWeb, :controller

  def show(conn, %{"id" => _id}) do
    json(conn, %{"error" => "Method Removed"})
  end

  def create(conn, _params) do
    json(conn, %{"error" => "Method Removed"})
  end
end
