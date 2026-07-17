#!/bin/sh

sd=$(dirname "$0")

cd "$sd"/..

tar -cvf single-exe/assets.tar runtime README.md CHANGELOG.md src/cui/server.mjs src/cui/rpc.mjs testapp.md select.md
