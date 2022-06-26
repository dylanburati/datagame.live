defmodule App.MathExtensions do
  defp haversin(num) do
    x = :math.sin(num / 2.0)
    x * x
  end

  defp sin2(num) do
    x = :math.sin(num)
    x * x
  end

  defp cos2(num) do
    x = :math.cos(num)
    x * x
  end

  def geodist(lat1, lon1, lat2, lon2) do
    flattening = 1.0 / 298.257223563
    radius_km = 6378.137

    # lambert's formula
    b1 = :math.atan((1.0 - flattening) * :math.tan(lat1))
    b2 = :math.atan((1.0 - flattening) * :math.tan(lat2))
    dlambda = abs(lon1 - lon2)
    dphi = abs(b1 - b2)
    central2 = haversin(dphi) + haversin(dlambda) * (1.0 - haversin(dphi) - haversin(lat1 + lat2))
    halfcentral = :math.asin(:math.sqrt(central2))
    central = 2 * halfcentral
    p = 0.5 * (b1 + b2)
    q = 0.5 * (b2 - b1)
    x = (central - :math.sin(central)) * sin2(p) * cos2(q) / cos2(halfcentral)
    y = (central + :math.sin(central)) * sin2(q) * cos2(p) / sin2(halfcentral)
    radius_km * (central - 0.5 * flattening * (x + y))
  end
end
