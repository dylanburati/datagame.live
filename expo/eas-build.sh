#!/bin/bash
exit_with() {
    echo "$1"
    exit 1
}
PATH="/cygdrive/c/Program Files/Git/cmd:/cygdrive/c/Users/dylan/AppData/Roaming/npm:/usr/local/bin:/usr/bin"
if ! git diff --quiet; then
    exit_with "Uncommitted changes found, exiting"
fi
if [[ "x$(git branch --show-current)" -ne "xmain" ]]; then
    exit_with "Must be run from the main branch"
fi
LAST_VERSION="$(git tag -l | grep '^expo-' | tail -n 1 | sed 's/^expo-/')"
echo $LAST_VERSION
LAST_VERSION_STR="${LAST_VERSION%%-*}"
LAST_VERSION_CODE="${LAST_VERSION##*-}"
echo $LAST_VERSION_STR $LAST_VERSION_CODE
CURR_VERSION_STR="$(cat app.json | jq -r '.expo.version')"
CURR_VERSION_CODE="$(cat app.json | jq -r '.expo.ios.buildNumber')"
if [[ ":$CURR_VERSION_CODE" != ":$(cat app.json | jq -r '.expo.android.versionCode')" ]]; then
    exit_with "Error in app.json: Android versionCode != iOS buildNumber"
fi
