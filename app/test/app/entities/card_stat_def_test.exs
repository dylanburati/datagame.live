defmodule App.Entities.CardStatDefTest do
  use ExUnit.Case
  alias App.Entities.CardStatDef

  describe "parse_stat/2" do
    test "parses strings" do
      for s <- ["", "\\", "\u2013", "mail@example.com"] do
        assert CardStatDef.parse_stat("string", s) == {:ok, s}
      end
    end

    test "parses numbers" do
      assert CardStatDef.parse_stat("number", "") == :error
      assert CardStatDef.parse_stat("number", "0") == {:ok, 0}
      assert CardStatDef.parse_stat("number", "10") == {:ok, 10}
      # assert CardStatDef.parse_stat("number", "01") == :error
      assert CardStatDef.parse_stat("number", "0x9") == :error
      assert CardStatDef.parse_stat("number", "AF") == :error
      assert CardStatDef.parse_stat("number", "0.1") == {:ok, 0.1}
      # assert CardStatDef.parse_stat("number", ".23") == {:ok, 0.23}
      assert CardStatDef.parse_stat("number", "-0.4") == {:ok, -0.4}
      # assert CardStatDef.parse_stat("number", "-.56") == {:ok, -0.56}
      assert CardStatDef.parse_stat("number", "7,000") == {:ok, 7000}
    end

    test "parses dates" do
      assert CardStatDef.parse_stat("date", "") == :error
      assert CardStatDef.parse_stat("date", "2023") == :error
      assert CardStatDef.parse_stat("date", "6/15/2023") == :error
      assert CardStatDef.parse_stat("date", "2023-06-15") == {:ok, ~N[2023-06-15 00:00:00]}
      assert CardStatDef.parse_stat("date", "2023-02-29") == :error
      assert CardStatDef.parse_stat("date", "2024-02-29") == {:ok, ~N[2024-02-29 00:00:00]}
    end

    test "parses dollar amounts" do
      assert CardStatDef.parse_stat("dollar_amount", "") == :error
      assert CardStatDef.parse_stat("dollar_amount", "$") == :error
      assert CardStatDef.parse_stat("dollar_amount", "$0") == {:ok, 0}
      assert CardStatDef.parse_stat("dollar_amount", "$10") == {:ok, 10}
      assert CardStatDef.parse_stat("dollar_amount", "$-1.56") == {:ok, -1.56}
      assert CardStatDef.parse_stat("dollar_amount", "$7,000") == {:ok, 7000}
      Enum.reduce_wh
    end

    test "parses lat/lon coordinates" do
      assert CardStatDef.parse_stat("lat_lon", "") == :error
      assert CardStatDef.parse_stat("lat_lon", "0,0") == {:ok, {0, 0}}
      assert CardStatDef.parse_stat("lat_lon", "0, 0") == {:ok, {0, 0}}
      assert CardStatDef.parse_stat("lat_lon", "-100,190") == :error
      assert CardStatDef.parse_stat("lat_lon", "-80.5,170.5") == {:ok, {-80.5, 170.5}}
      assert CardStatDef.parse_stat("lat_lon", "89.5,-179.5") == {:ok, {89.5, -179.5}}
    end
  end
end
