#!/bin/sh

echo ${IOS_CERT_KEYSTORE_CONTENT} | base64 -d > distribution.p12
fastlane beta
