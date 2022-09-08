defmodule App.Entities.Trivia.TriviaLoaderDefaults do
  defmacro __using__(_) do
    quote do
      def exec_answer_query(_, query), do: App.Repo.all(query)
    end
  end
end
