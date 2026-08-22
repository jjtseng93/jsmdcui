# Single-file executable bootstrap

Bundles a project's runtime assets into one `bun build --compile` binary, so
the executable carries its own `demos/`, `runtime/`, templates and so on.

Assets are declared once, in `package.json`:

```json
{
  "assets": ["demos", "runtime", "README.md", "src/cui/server.mjs"]
}
```

Paths are relative to the project root. Folders are packed recursively; only
regular files are stored, so symlinks and empty folders leave no trace.

## The two back ends

The default packs everything into a gzipped `assets.tar` that is embedded as a
single file and unpacked into memory at startup. Setting `ASSETS_BUNFS=1` at
build time switches to `bun build --compile --asset`, which stores the files
individually inside the binary's virtual filesystem instead.

Reading code never sees the difference — `assetsHelper` answers the same keys
either way. The trade is binary size against startup cost:

| | tar (default) | `ASSETS_BUNFS=1` |
| --- | --- | --- |
| Stored as | one gzipped archive | individual files, uncompressed |
| Size, for jsgotty's 3.45 MB of assets | **0.70 MB** | 3.45 MB |
| Work before `main` runs | decode the archive, copy every file into memory | **none** |
| Startup cost, same assets | ~16 ms | **0 ms** |
| Resident memory | whole payload, always | only what is read |
| Maturity | in use | experimental |

Text compresses well, so the tar usually wins on size by a wide margin — the
numbers above are mostly one 1.6 MB bundle and its source map. What it costs is
paid on every run, whether or not the program touches a single asset. Reach for
`ASSETS_BUNFS=1` when that startup work, or holding the whole payload in memory,
matters more than the extra megabytes on disk.

## Adopting it in another project

Copy `single-exe/` to the project root. The folder may be renamed or moved;
three edits point it at the new home.

1. **`assetsPacker.js`, the first two lines.** They are the only place the
   asset root is written down, and a static import specifier cannot be
   computed, so both must be literal:

   ```js
   import pkg from "../package.json" with { type: "json" };
   export const ASSETS_ROOT = "..";
   ```

2. **`entry.mjs`, the last import.** It names the program to start. Build
   also reads this line to find the entry point for `ASSETS_BUNFS=1`, so keep
   it as the final import in the file:

   ```js
   await import("../src/index.js");
   ```

3. **`package.json`.** Add the `assets` array shown above.

Everything else — `compiled.js`, `assetsHelper.js`, `assetsLoader.mjs` — is
project independent.

Node's own entry path must not import `assetsLoader.mjs` or `entry.mjs`; those
are Bun only. `assetsHelper.js` and `compiled.js` run under Node 20.11+.

## Reading assets

Import from `assetsHelper.js`. Keys are the same package-relative paths that
appear in `package.json`.

| Function | Returns |
| --- | --- |
| `readInternalAssetText(path)` | string, or `null` when not embedded |
| `readInternalAssetBytes(path)` | `Uint8Array`, or `null` |
| `readAssetText(path)` | as above, falling back to the file on disk |
| `readAssetBytes(path)` | as above, as bytes |
| `hasInternalAssets()` | whether this package has anything embedded |
| `listInternalAssetPaths(prefix?)` | every embedded path under `prefix` |
| `listInternalAssetDirs(prefix?)` | the immediate child names under `prefix` |
| `assetPath(...parts)` | joins parts into a key |
| `SELF` | this package's namespace, `assets/<name>@<version>` |

The read functions are synchronous for embedded assets on both back ends.
`readAssetText` / `readAssetBytes` are async only because of the disk
fallback, which is what makes the same code work from a source checkout.

```js
import { readAssetText, listInternalAssetDirs } from "../single-exe/assetsHelper.js";

const page = await readAssetText("templates/page.html");
const demos = listInternalAssetDirs("demos");
```

## Building

`compiled.js` exports the build entry points. Wire `buildEarlyExit` into the
CLI and it handles `--build-exe` and `--build-for <target>`:

```js
import { buildEarlyExit, IS_COMPILED, REPO_ROOT } from "./single-exe/compiled.js";

await buildEarlyExit(process.argv, "myapp");
```

`REPO_ROOT` is the project root in a checkout and the executable's own folder
once compiled, which is where `--assets-extract` writes. `IS_COMPILED` tells
the two apart.

### Chaining file/folder assets across dependencies

A build first bundles once to write a metafile, then treats every
`assetsPacker.js` appearing in its `inputs` as a participant. Each package
vendors its own `single-exe/`, and its `assetsHelper` imports its
`assetsPacker`, so a packer lands in that graph exactly when the package is
reachable from the entry point. There is no registration step, and anything
tree-shaken away brings nothing with it.

The packers then run one after another, each adding its files under its own
`assets/<name>@<version>/` namespace — appending into the shared `assets.tar`
by default, or copying into the shared `build/assets` tree under
`ASSETS_BUNFS=1`. Only once every packer has finished does the real compile
run, so the archive is complete and, by default, compressed by then.

That namespace is why `ASSETS_BUNFS=1` stages every package into one fixed
`build/assets`. `--asset` keeps only the **basename** of the path it is given
and preserves everything below it, so the folder's own name becomes the root
inside the binary:

```
--asset ./build/assets   with   build/assets/jsgotty@1.1.6/static/index.html
                          ->    assets/jsgotty@1.1.6/static/index.html
```

Pass `./build/assets/jsgotty@1.1.6` instead and `build/assets/` is gone: the
files land at `jsgotty@1.1.6/...` and every package gets its own root. One
folder named `assets`, everyone copying into it, is what makes the keys come
out the same as the ones the tar back end writes.

`assetsPacker.js` also runs standalone; `--help` documents its flags.

## Why the loader hands over a Promise

`entry.mjs` imports `assetsLoader.mjs`, awaits `globalThis.assetsLoaderPromise`,
and only then imports the main program. The indirection is deliberate: the
loader carries a Bun-only import,

```js
import assets from "./assets.tar" with { type: "file" };
```

and if the main program imported the loader, that dependency would land in its
module graph. Node could then no longer load the program at all — not even to
fall back to reading the assets from disk.

Keeping the loader behind `entry.mjs` means the main program never mentions it,
so Node 20.11+ runs the same file directly against on-disk assets while Bun
runs it through the bootstrap. The Promise is that boundary, not a workaround
for missing top-level await.

`ASSETS_BUNFS=1` sidesteps the question: with no tar to load, the build skips
`entry.mjs` and compiles the main program as its own entry point.

## Environment variables

| Variable | When | Effect |
| --- | --- | --- |
| `ASSETS_BUNFS=1` | build | use `--asset` instead of the tar |
| `ASSETS_NO_GZIP=1` | build | leave `assets.tar` uncompressed |
| `ASSETS_DEBUG=1` | run | print how long unpacking took |

## Runtime flags

| Flag | Effect |
| --- | --- |
| `--assets-list` | print every embedded path and exit |
| `--assets-extract` | write the assets next to the executable and exit |
| `--assets-external` | ignore embedded assets and read from disk |

These are handled by `assetsLoader.mjs`, so they exist in tar builds only.
