#!/bin/bash
exit_with() {
    echo "$1"
    exit 1
}
PATH="/cygdrive/c/Program Files/Git/cmd:/cygdrive/c/Program Files/nodejs:/cygdrive/c/Users/dylan/AppData/Roaming/npm:/usr/local/bin:/usr/bin"
if ! git diff --stat --exit-code; then
    exit_with "Uncommitted changes found, exiting"
fi
if [ "x$(git branch --show-current)" != "xmain" ]; then
    exit_with "Must be run from the main branch"
fi
LAST_VERSION="$(git tag -l --no-contains=HEAD | grep '^expo-' | tail -n 1 | sed 's/^expo-//')"
LAST_VERSION_STR="${LAST_VERSION%%-*}"
LAST_VERSION_CODE="${LAST_VERSION##*-}"
if [ "x$LAST_VERSION_STR" = "x" ] || [ "x$LAST_VERSION_CODE" = "x" ]; then
    exit_with "No previous versions found in git tags"
fi
CURR_VERSION_STR="$(cat app.json | jq -r '.expo.version')"
CURR_VERSION_CODE="$(cat app.json | jq -r '.expo.ios.buildNumber')"
if [ ":$CURR_VERSION_CODE" != ":$(cat app.json | jq -r '.expo.android.versionCode')" ]; then
    exit_with "Error in app.json: Android versionCode != iOS buildNumber"
fi
if [ $CURR_VERSION_CODE -le $LAST_VERSION_CODE ]; then
    exit_with "Version code $CURR_VERSION_CODE <= $LAST_VERSION_CODE, exiting"
fi
git tag "expo-${CURR_VERSION_STR}-${CURR_VERSION_CODE}" HEAD

eas build $@
