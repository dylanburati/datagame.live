defmodule App.Repo.Migrations.CreateRoomUser do
  use Ecto.Migration

  def change do
    create table(:room_user) do
      add :name, :string
      add :room_id, references(:room, on_delete: :delete_all)

      timestamps()
    end

    create unique_index(:room_user, [:room_id, :name])
  end
end
