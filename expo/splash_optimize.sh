#!/bin/bash

find web-build/pwa/apple-touch-startup-image -type f | \
sed 's/\([0-9]\+\)x\([0-9]\+\)\.png/\0 \1 \2/' | \
while read F W H; do
  H2=$(printf '%.0f' $(echo "$W" | jq ". * 2778 / 1284 + 0.5"))
  HM=$(( $H2 > $H ? $H2 : $H ))
  Y=$(printf '%.0f' $(echo "[$HM, $H]" | jq '(.[0] - .[1]) / 2 + 0.5'))
  sharp -i ./assets/splash.png -o "$F" -- resize $W $HM -- extract $Y 0 $W $H
done
