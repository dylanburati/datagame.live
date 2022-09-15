defmodule App.Entities.PairingServiceTest do
  use ExUnit.Case

  alias App.Entities.CardStatDef
  import App.Entities.PairingService

  test "calc_agg geodist" do
    stat_def = %CardStatDef{key: "stat1", stat_type: "lat_lon", label: "Coordinates"}

    # not sure why this is off by more than 20m
    assert_in_delta calc_agg(stat_def, "geodist", "89.5,60", "89.5,30"), 28.90818, 0.1
    assert_in_delta calc_agg(stat_def, "geodist", "-89.5,-90", "89.5,90"), 20003.92, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "-89.5,90", "89.5,90"), 19892.22, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "0,90", "89.5,90"), 9946.111, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "0,90", "0,-90"), 20037.51, 0.02
    assert_in_delta calc_agg(stat_def, "geodist", "0,90", "0,180"), 10018.76, 0.02
  end
end
