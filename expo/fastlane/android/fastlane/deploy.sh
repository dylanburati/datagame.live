#!/bin/sh

echo ${ANDROID_SIGNING_KEY} | base64 -d > fastlane/store0.keystore
echo ${ANDROID_PLAY_STORE_CREDENTIALS} | base64 -d > fastlane/play-store-credentials.json
fastlane beta
