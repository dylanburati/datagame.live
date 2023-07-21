defmodule App.Repo.Migrations.UserRole do
  use Ecto.Migration

  def change do
    rename table(:user), :kind, to: :role
  end
end
