#!/bin/sh

echo ${IOS_PRIVATE_KEY} | base64 -d > PrivateKey.p12
fastlane beta
