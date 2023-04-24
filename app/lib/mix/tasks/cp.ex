defmodule Mix.Tasks.Cp do
  @moduledoc "Copies contents of one directory to another"
  @shortdoc "Copies files"

  use Mix.Task

  @impl Mix.Task
  def run(args) do
	with [src, dest] <- args do
	  File.cp_r!(src, dest)
    end
  end
end
