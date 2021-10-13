defmodule App.Repo.Migrations.RoomHasCreator do
  use Ecto.Migration

  def change do
    alter table(:room) do
      add :creator_id, references(:room_user, on_delete: :delete_all)
    end
  end
end
