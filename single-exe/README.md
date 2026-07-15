# This is completely optional
- I still recommend using the methods in the root README.md
- Bun's Android build is currently not supported

# Usage
- First run `bun ./packAssets.sh` to bundle the assets into `assets.tar`
- Then run the build script like this

  ```shell
  bun build --compile --bytecode --minify ./entry.mjs --outfile=binname
  ```

- You'll get a binname executable

# Single Executable Intro

This folder contains the Bun single-exe bootstrap used by the project.

## Entry Flow

- `entry.mjs` imports `assetsLoader.mjs` first
- `assetsLoader.mjs` loads `assets.tar` with `Bun.Archive` and mounts it as `globalThis.internalAssets`
- `assetsLoaderPromise` is exposed on `globalThis`
- The main program waits for `assetsLoaderPromise` if it exists

That keeps the main program bootable even if asset loading reports errors.

## Assets Loading

- Bundled assets are loaded sequentially with `await file.bytes()`
- Load failures are collected and printed to `stderr`
- Asset loading never rejects the bootstrap promise
- When loading succeeds, the archive is available through `globalThis.internalAssets`

## CLI Flags

- `--assets-list`
  - Lists all entries inside bundled `assets.tar`
  - Exits early before the main program starts

- `--assets-extract`
  - Extracts bundled assets to the same directory as the executable
  - Exits early before the main program starts

- `--assets-external`
  - Skips loading bundled assets into `globalThis.internalAssets`
  - Forces the main program and runtime helpers to use the external file tree
  - Keeps the bootstrap alive while leaving `internalAssets` falsy

## Adapting this folder

This single-exe folder is intended for reuse by other projects. Usually you
only need to edit these project-specific files first:

- `entry.mjs`
- `packAssets.sh`

Then the main program can import `buildEarlyExit` from `compiled.js` and call
it before normal CLI parsing. `--build-exe` and `--build-for <target>` will run
`packAssets.sh` first, so `assets.tar` is generated as part of the build flow.

```js
const compiledHelper = await import("./single-exe/compiled.js").catch(() => null);
await compiledHelper?.buildEarlyExit?.(process.argv, "my-bin");
```

- `--build-exe` builds with no Bun target.
- `--build-for <target>` passes `<target>` to `bun build --target=<target>`.
- The second argument is the output filename. If omitted, it defaults to `single.exe`.

The main program should also switch its repo/resource root when running as a
compiled binary. Use `IS_COMPILED` and `REPO_ROOT` from
`compiled.js`; when compiled, treat the executable directory as the repo root
used for external fallback files such as `static/`, `README.md`, or other files
packed by `packAssets.sh`.

```js
const compiledHelper = await import("./single-exe/compiled.js").catch(() => null);
const repoRoot = compiledHelper?.REPO_ROOT
```
