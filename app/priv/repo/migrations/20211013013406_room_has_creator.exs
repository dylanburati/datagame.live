defmodule App.Repo.Migrations.RoomHasCreator do
  use Ecto.Migration

  def change do
    alter table(:room) do
      add :creator_id, references(:room_user)
    end
  end
end
