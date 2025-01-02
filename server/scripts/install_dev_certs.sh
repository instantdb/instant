#!/bin/bash
set -o errexit -o nounset -o pipefail -o xtrace
cd `dirname $0`/..

brew install mkcert
brew install nss

mkcert -install
mkdir -p dev-resources/certs
cd dev-resources/certs
DOMAIN="dev.instantdb.com"
mkcert ${DOMAIN}

CA_ROOT="$(mkcert -CAROOT)/rootCA.pem"

cat ${DOMAIN}.pem "$CA_ROOT" > chain.pem
echo "USE PASSWORD: changeit"
openssl pkcs12 -export -inkey ${DOMAIN}-key.pem -in chain.pem -out dev.p12
keytool -importkeystore  -storepass changeit -srckeystore dev.p12 -srcstoretype pkcs12 -destkeystore dev.jks -deststoretype pkcs12
# verify
keytool -list -v -storepass changeit -keystore dev.jks

rm dev.p12
rm chain.pem