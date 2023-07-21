defmodule AppWeb.UserAuth do
  import Plug.Conn
  import Phoenix.Controller

  alias App.Entities.UserService
  alias App.Repo
  alias App.Entities.User
  alias App.UserToken
  alias AppWeb.Router.Helpers, as: Routes

  # Adapted from https://github.com/elixircastsio/148-live-view-auth-pt-2

  # Make the remember me cookie valid for 60 days.
  @max_age 10 * 60 * 24 * 60
  @remember_me_cookie "_datagame_remember_me"
  @remember_me_options [sign: true, max_age: @max_age, same_site: "Lax"]

  @doc """
  Logs the user in.

  It renews the session ID and clears the whole session
  to avoid fixation attacks. See the renew_session
  function to customize this behaviour.

  It also sets a `:live_socket_id` key in the session,
  so LiveView sessions are identified and automatically
  disconnected on log out. The line can be safely removed
  if you are not using LiveView.
  """
  def log_in_user(conn, user, params \\ %{}) do
    token = App.UserToken.generate_and_sign!(%{"sub" => user.id})

    conn
    |> renew_session()
    |> put_session(:user_token, token)
    # |> put_session(:live_socket_id, "users_sessions:#{Base.url_encode64(token)}")
    |> maybe_write_remember_me_cookie(token, params)
    |> redirect(to: Routes.page_path(conn, :index))
  end

  defp maybe_write_remember_me_cookie(conn, token, %{"remember_me" => "true"}) do
    put_resp_cookie(conn, @remember_me_cookie, token, @remember_me_options)
  end

  defp maybe_write_remember_me_cookie(conn, _token, _params) do
    conn
  end

  # This function renews the session ID and erases the whole
  # session to avoid fixation attacks. If there is any data
  # in the session you may want to preserve after log in/log out,
  # you must explicitly fetch the session data before clearing
  # and then immediately set it after clearing, for example:
  #
  #     defp renew_session(conn) do
  #       preferred_locale = get_session(conn, :preferred_locale)
  #
  #       conn
  #       |> configure_session(renew: true)
  #       |> clear_session()
  #       |> put_session(:preferred_locale, preferred_locale)
  #     end
  #
  defp renew_session(conn) do
    conn
    |> configure_session(renew: true)
    |> clear_session()
  end

  @doc """
  Logs the user out.

  It clears all session data for safety. See renew_session.
  """
  def log_out_user(conn) do
    if get_session(conn, :user_token) do
      delete_session(conn, :user_token)
    end

    # if live_socket_id = get_session(conn, :live_socket_id) do
    #   AppWeb.Endpoint.broadcast(live_socket_id, "disconnect", %{})
    # end

    conn
    |> renew_session()
    |> delete_resp_cookie(@remember_me_cookie)
    |> redirect(to: Routes.page_path(conn, :index))
  end

  @doc """
  Authenticates the user by looking into the session and remember me token.
  """
  def fetch_current_user(conn, _opts) do
    {user_token, conn} = ensure_user_token(conn)
    user = UserService.get_by_token(user_token)
    assign(conn, :current_user, user)
  end

  defp ensure_user_token(conn) do
    if user_token = get_session(conn, :user_token) do
      {user_token, conn}
    else
      conn = fetch_cookies(conn, signed: [@remember_me_cookie])

      if user_token = conn.cookies[@remember_me_cookie] do
        {user_token, put_session(conn, :user_token, user_token)}
      else
        {nil, conn}
      end
    end
  end

  @doc """
  Used for routes that require the user to be authenticated.

  If you want to enforce the user email is confirmed before
  they use the application at all, here would be a good place.
  """
  def require_authenticated_user(conn, opts) do
    if user = conn.assigns[:current_user] do
      case Keyword.get(opts, :role) do
        nil -> conn
        v when v == user.role -> conn
        _ ->
          conn
          |> put_flash(:error, "You don't have clearance to access this page.")
          |> redirect(to: Routes.page_path(conn, :index))
          |> halt()
      end
    else
      conn
      |> put_flash(:error, "You must log in to access this page.")
      |> redirect(to: Routes.page_path(conn, :index))
      |> halt()
    end
  end
end
