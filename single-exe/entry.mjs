#!/usr/bin/env bun

// 1. Injects assets to global.internalAssets
//   as { "./path/in/tar":file.bytes() }
// 2. Sets global.assetsLoaderPromise
// 3. Starts the main program only after the assets are ready
import "./assetsLoader.mjs";

await globalThis.assetsLoaderPromise;
await import("../src/index.js");
