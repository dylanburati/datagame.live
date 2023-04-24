defmodule AppWeb.RoomMessage do
  @moduledoc """
  Defines a message from a client to the "room:*" channel.

  The message format requires the following keys:

    * `:channel_pid` - The sending socket's channel PID
    * `:event`- The string event name, for example "ask"
    * `:payload` - The message payload
    * `:reply_ref` - The sending socket's reply ref

  This key was removed:

    * `:topic` - The string "room:{room_id}"
  """

  @type t :: %AppWeb.RoomMessage{}
  defstruct channel_pid: nil, event: nil, payload: nil, reply_ref: nil
end

defmodule AppWeb.RoomEntrance do
  @moduledoc """
  Defines an entrance made by a client to the "room:*" channel.

  The message format requires the following keys:

    * `:channel_pid` - The joining socket's channel PID
    * `:ref` - The joining socket's ref
    * `:user_id` - The user ID for the new client
    * `:display_name` - The display name for the new client
  """

  @type t :: %AppWeb.RoomEntrance{}
  defstruct channel_pid: nil, ref: nil, user_id: nil, display_name: nil
end
