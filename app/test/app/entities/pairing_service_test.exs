defmodule App.Entities.PairingServiceTest do
  use ExUnit.Case

  alias App.Entities.CardStatDef
  import App.Entities.PairingService

  test "calc_agg geodist" do
    stat_def = %CardStatDef{key: "stat1", stat_type: "lat_lon", label: "Coordinates"}

    # not sure why this is off by more than 20m
    assert_in_delta calc_agg(stat_def, "geodist", "89.5,60", "89.5,30"), 28.87587, 0.1
    assert_in_delta calc_agg(stat_def, "geodist", "-89.5,-90", "89.5,90"), 19981.56, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "-89.5,90", "89.5,90"), 19869.99, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "0,90", "89.5,90"), 9934.996, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "0,90", "0,-90"), 20015.12, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "0,90", "0,180"), 10007.56, 0.02
  end
end
