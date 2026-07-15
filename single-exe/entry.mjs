#!/usr/bin/env bun

// 1. Injects assets to global.internalAssets
//   as { "./path/in/tar":file.bytes() }
// 2. Sets global.assetsLoaderPromise
import "./assetsLoader.mjs"

import "../src/index.js"

