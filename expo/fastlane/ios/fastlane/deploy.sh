#!/bin/sh

echo ${IOS_CERT_KEYSTORE_CONTENT} | base64 -d > PrivateKey.p12
fastlane beta
