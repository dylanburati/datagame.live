defmodule App.Repo.Migrations.RoomRemoveCode do
  use Ecto.Migration

  def change do
    execute "DELETE FROM room_user", ""
    drop unique_index(:room, [:code])
    alter table(:room) do
      remove :code, :string, null: false
    end
    execute "", "DELETE FROM room_user"
    execute "DELETE FROM card_tag", ""
    alter table(:card_tag) do
      add :count, :integer, null: false
    end
  end
end
