# Bun Single-File Executable Bootstrap

Build a Bun application and its runtime assets into one executable while
keeping the regular main module free of Bun-specific asset imports.

You can copy and adapt this build setup for your own project by changing its
main-module path and asset list as described below.

- Bundle an asset tree alongside the application code in one executable.
- Keep the regular main module available to the Node.js ESM execution path.
- Read embedded resources first with an optional external-file fallback.
- List, extract, or bypass embedded assets with built-in CLI flags.
- Build for the current platform or pass a Bun cross-compilation target.

> This workflow is optional; the standard methods in the root README remain
> available. Bun's Android build is currently not supported.

## Quick start for jsmdcui

From the repository root, build for the current platform:

```shell
bun ./src/index.js --build-exe
./mdcui --version
```

`--build-exe` runs `packAssets.sh` automatically and writes the `mdcui`
executable to the current directory. To pass a Bun compilation target, use:

```shell
bun ./src/index.js --build-for <target>
```

Any additional arguments after `--build-exe`, or after the target passed to
`--build-for`, are forwarded to the `bun build` command:

```shell
bun ./src/index.js --build-exe --sourcemap
bun ./src/index.js --build-for <target> --sourcemap
```

Bun expects `--define` values to be JSON-style literals, so strings normally
need quotes. `stringifyNonPrimitiveDefineValues()` converts a bare value with
`JSON.stringify()` before it reaches Bun. jsmdcui uses it for
`global.MDCUI_MAIN`.

`global.MDCUI_MAIN` is a jsmdcui application convention, not a name reserved by
the single-executable helpers. An adopting project can use
`global.MY_EMBEDDED_APP`, or any other build expression, as long as it updates
its own call sites and passes the same name to
`stringifyNonPrimitiveDefineValues()`.

The jsmdcui switch defines below are presence-based: `=0` and `=false` still
enable them. Omit a switch define to disable it; examples consistently use
`=1`.

- `MDCUI_DEFAULT_EDIT=1`: editable-text default.
- `MDCUI_DEFAULT_DEMO=1`: no-argument `testapp.md` TUI.
- `MDCUI_DEFAULT_DEMO_WUI=1`: no-argument `testapp.md` WUI.
- `MDCUI_OVERWRITE_DEMO=1`: overwrite modifier; it does not select a demo.
- `global.MDCUI_MAIN=<path>.md`: embed a custom Markdown app and its generated
  front, RPC, back, HTML, and server modules.
- `global.MDCUI_MAIN_BASE`: generated internally from `MDCUI_MAIN`; do not pass
  it manually.

Put defines after `--build-exe` (or after the `--build-for` target), and choose
at most one `MDCUI_DEFAULT_*` mode.

| Build defines | No-argument launch | Switch UI |
| --- | --- | --- |
| `MDCUI_DEFAULT_EDIT=1` | text editor | `./mdcui --tui app.md` |
| `MDCUI_DEFAULT_DEMO=1` | `testapp.md` TUI | `./mdcui --wui --demo` |
| `MDCUI_DEFAULT_DEMO_WUI=1` | `testapp.md` WUI | `./mdcui --tui --demo` |
| `global.MDCUI_MAIN=../中文工具.md` | custom TUI | `./mdcui --wui --demo-中文工具` |
| MAIN plus `MDCUI_DEFAULT_DEMO_WUI=1` | custom WUI | `./mdcui --tui --demo-中文工具` |

For a custom TUI-default executable:

```shell
bun ./src/index.js --build-exe \
  --define global.MDCUI_MAIN=../中文工具.md
```

For a custom WUI-default executable:

```shell
bun ./src/index.js --build-exe \
  --define global.MDCUI_MAIN=../中文工具.md \
  --define MDCUI_DEFAULT_DEMO_WUI=1
```

Explicit runtime arguments suppress automatic demo/WUI selection, so switching
UI must repeat `--demo` or `--demo-中文工具`. The main basename must end in
lowercase `.md`; its demo name allows Unicode letters/numbers (including
Chinese), dots, underscores, and hyphens, but no whitespace.

The custom demo uses embedded TUI front/RPC or the embedded WUI server when its
local Markdown byte length matches the embedded asset. Missing or overwritten
demos use embedded modules after the asset is written. A differing byte length
warns and selects filesystem companion modules.

To perform the same steps manually, run these commands from `single-exe/`:

```shell
bun ./packAssets.sh
bun build --format=esm --compile --minify --bytecode ./entry.mjs --outfile=mdcui
```

## Adapting this folder to another project

This folder is a reusable starting point, not a drop-in package. The current
`entry.mjs` and `packAssets.sh` contain jsmdcui paths, so another project must
complete the following integration steps.

The adopting project needs Bun for packing and compiling, a `tar` command for
`packAssets.sh`, and an ES-module setup. Keep `"type": "module"` in
`package.json`, or rename the copied `.js` modules to `.mjs` and update their
imports. The supported uncompiled Node path requires Node.js 20.11 or newer
because `compiled.js` uses `import.meta.dirname`.

`assetsHelper.js` and `compiled.js` are Node-compatible under those conditions.
`assetsLoader.mjs` and `entry.mjs` are Bun-only and must not be imported by the
regular Node entry path.

### 1. Copy the bootstrap directory

Copy the entire `single-exe/` directory to the root of the other project and
keep its name and relative position unless you also update the paths in
`compiled.js` and `packAssets.sh`. A typical layout is:

```text
my-project/
├── single-exe/
│   ├── assetsHelper.js
│   ├── assetsLoader.mjs
│   ├── compiled.js
│   ├── entry.mjs
│   └── packAssets.sh
└── src/
    └── index.js
```

`assets.tar` is generated by `packAssets.sh`; it does not need to exist before
the first packing step.

### 2. Point `entry.mjs` at the main program

Keep the asset loader as the first import and change the path passed to the
final `await import()` so it points to the other project's real entry module:

```js
#!/usr/bin/env bun

import "./assetsLoader.mjs";
await globalThis.assetsLoaderPromise;
await import("../src/index.js");
```

> **Important:** Keep the final import dynamic. Do not replace it with a static
> `import "../src/index.js"`, because static dependencies are evaluated before
> the asset Promise is awaited.

Only the Bun single-file executable build should use this bootstrap entry.
Continue to run the regular main module directly when using Node:

```shell
node ./src/index.js
```

### 3. Choose which files to embed

Edit the resource list in `packAssets.sh`; the script runs `tar` for you. It
changes to the project root, writes `single-exe/assets.tar`, and packs every
listed runtime resource required by the compiled program. Paths stored in the
archive become the lookup keys used by `assetsHelper.js`; use keys such as
`public/app.css`, without a leading `./`. The normal `--build-exe` and
`--build-for` flows invoke this script automatically, so you do not need to run
`tar` yourself.

For example:

```sh
#!/bin/sh

script_dir=$(dirname "$0")
cd "$script_dir/.." || exit 1

tar -cvf single-exe/assets.tar public templates README.md
```

Do not retain jsmdcui's `demos`, `runtime`, `src/cui`, or `testapp.md` entries
unless the adopting project actually contains and needs them.

### 4. Read embedded assets with an external fallback

Import the Node-compatible helpers from `assetsHelper.js`. They return `null`
when the embedded store is unavailable or a path is not present:

```js
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { readInternalAssetText } from "../single-exe/assetsHelper.js";
import { REPO_ROOT } from "../single-exe/compiled.js";

async function readResourceText(path) {
  return readInternalAssetText(path) ??
    await readFile(resolve(REPO_ROOT, path), "utf8");
}
```

In the source tree, `REPO_ROOT` is the project root. In a compiled executable,
it is the executable's directory, which is also where `--assets-extract`
places the external resource tree. Apply the same embedded-first fallback to
every file that must work in both modes. Use `readInternalAssetBytes()` when
a resource should be returned as bytes instead of decoded text.
Use `listInternalAssetPaths()` to list embedded asset paths and
`listInternalAssetDirs()` to list embedded directories.

#### Reuse images from a compiled HTML bundle

Bun exposes an imported HTML entry as a `homepage` object in a compiled
executable. Its `index` points to the compiled HTML and its `files` array lists
the content-hashed assets under Bun's compiled virtual filesystem: paths
normally begin with `/$bunfs/root/` on POSIX systems and `B:/~BUN/` on
Windows. The helpers can turn image references preserved in that HTML into a
lazy path map without copying the image bytes into `internalAssets`. Always use
the path returned by `homepage.files`; do not hard-code either platform prefix.

Before compiling, preserve each original image reference in a custom
attribute. Its name belongs to the adopting project; it is not fixed by the
helper. This example chooses `data-original-image`. Bun rewrites `src` but
leaves the custom attribute intact:

```html
<!-- Input -->
<img src="./images/photo.jpg" data-original-image="./images/photo.jpg">

<!-- Compiled HTML -->
<img src="/photo-abcd1234.jpg" data-original-image="./images/photo.jpg">
```

Export the imported HTML bundle from a module that both the web server and
terminal runtime can load:

```js
import homepage from "./index.html";

export { homepage };
```

Build and cache the map only in a compiled executable. Guard the import first:
a source-tree launch does not necessarily have the generated server or HTML
module.

```js
import {
  buildHtmlBundleImageMap,
  canonicalHtmlBundleImageHref,
} from "../single-exe/assetsHelper.js";
import { IS_COMPILED } from "../single-exe/compiled.js";

let imageMapPromise = null;
const imageSourceAttribute = "data-original-image";

function getBundledImageMap() {
  if (!IS_COMPILED || !global.MY_EMBEDDED_APP) return null;

  imageMapPromise ??= import(global.MY_EMBEDDED_APP + "-server.js")
    .then(module => buildHtmlBundleImageMap(
      module.homepage,
      imageSourceAttribute,
    ));

  return imageMapPromise;
}

const images = await getBundledImageMap();
const key = canonicalHtmlBundleImageHref(originalImageHref);
const bundledPath = images?.get(key);
const bytes = bundledPath ? await Bun.file(bundledPath).bytes() : null;
```

`global.MY_EMBEDDED_APP` is only an example build-time module selector. Name it
to match the adopting application, replace it with a direct static import, or
use another compiled-only condition. The helper does not inspect or require
`global.MDCUI_MAIN`; that is jsmdcui's own convention. When using a Bun
`--define`, use the same expression at the call site, for example
`--define global.MY_EMBEDDED_APP=...`.

`buildHtmlBundleImageMap(homepage, sourceAttribute)` reads the compiled HTML
once and returns a `Map<string, string>` from canonical original image
references to Bun compiled virtual paths on either platform. The second
argument is the custom attribute name. It defaults to `"data-mdcui-src"` only
for jsmdcui's convenience:

```js
const images = await buildHtmlBundleImageMap(homepage);
```

Adopting projects can choose any valid HTML attribute name and pass it
explicitly:

```html
<img src="./photo.jpg" data-original-image="./photo.jpg">
```

```js
const images = await buildHtmlBundleImageMap(
  homepage,
  "data-original-image",
);
```

The helper decodes HTML attribute entities and percent encoding so the HTML
reference can match the equivalent original caller reference. Image bytes
remain lazy and are read only when the caller uses the returned path.

For lower-level lookup, `findHtmlBundleAsset(homepage, publicPath, options)`
matches a rewritten public path such as `/photo-abcd1234.jpg` to its
`homepage.files` entry. `findHtmlBundleImageAsset()` restricts the lookup to
`image/*`, and `htmlBundleImageAssetPath()` returns only the corresponding
Bun compiled virtual path.

### 5. Add the optional build commands to the regular CLI

Before normal argument parsing, call `buildEarlyExit` from the regular main
module:

```js
const compiledHelper = await import("../single-exe/compiled.js").catch(() => null);
await compiledHelper?.buildEarlyExit?.(process.argv, "my-bin");
```

The second argument is the output filename; it defaults to `single.exe` when
omitted. This enables:

```shell
bun ./src/index.js --build-exe
bun ./src/index.js --build-for <target>
```

Both commands run `packAssets.sh` before `bun build`. The second form passes
`<target>` through as Bun's `--target=<target>` value.

Alternatively, build manually from inside `single-exe/`:

```shell
bun ./packAssets.sh
bun build --format=esm --compile --minify --bytecode ./entry.mjs --outfile=my-bin
```

#### Passing --define to bun build

`buildEarlyExit()` forwards build arguments to Bun, whose define parser expects
strings to be quoted literals. To accept a bare value such as a path, call the below
helper to normalize it before `buildEarlyExit()`:

```js
import {
  buildEarlyExit,
  stringifyNonPrimitiveDefineValues,
} from "../single-exe/compiled.js";

stringifyNonPrimitiveDefineValues(process.argv, "MY_STRING_DEFINE");
await buildEarlyExit(process.argv, "my-bin");
```

```shell
# Wrong: Bun parses the define before the helper runs.
bun --define MY_STRING_DEFINE=../app.md ./src/index.js --build-exe

# Correct
bun ./src/index.js --build-exe --define MY_STRING_DEFINE=../app.md
```

Before normalization:

```js
["--define", "MY_STRING_DEFINE=../app.md"]
```

After normalization:

```js
["--define", 'MY_STRING_DEFINE="../app.md"']
```

The inline form works too:
`--define=MY_STRING_DEFINE=../app.md` becomes
`--define=MY_STRING_DEFINE="../app.md"`.


### 6. Verify both execution paths

Verify the compiled asset archive and then run the program normally:

```shell
./my-bin --assets-list
./my-bin
```

Also run the uncompiled main module with Node.js 20.11 or newer to verify that
all required files have a working external fallback:

```shell
node ./src/index.js
```

Use `./my-bin --assets-extract` to write the packed tree beside the executable.
After extraction, `./my-bin --assets-external` skips the embedded store and is
useful for testing the external-resource path.

### Why `assetsLoaderPromise` is used

A more tightly coupled ESM design could export the assets with top-level
`await`, then make the main module import `assetsLoader.mjs` directly. This
project deliberately does not do that because `assetsLoader.mjs` contains
Bun's compiled-file import:

```js
import assets from "./assets.tar" with { type: "file" };
```

If the regular main module imported `assetsLoader.mjs`, that Bun-specific
`type: "file"` dependency would enter the main module graph. Node would then be
unable to load the program before it could select an external-file fallback.

Instead, only Bun's `entry.mjs` imports the Bun-specific loader, awaits its
Promise, and then dynamically imports the regular main module. The main module
does not import the loader, inspect the Promise, or contain Bun bootstrap code.
Under the supported Node.js 20.11+ ESM path, Node runs that clean main module
directly with external files. The Promise is therefore an intentional
Node-compatibility boundary inside the Bun-only bootstrap, not a failure to use
a more modern dependency or top-level-`await` design.

## Entry Flow

- `entry.mjs` imports `assetsLoader.mjs` first
- `assetsLoader.mjs` loads `assets.tar` with `Bun.Archive` and mounts it as `globalThis.internalAssets`
- `assetsLoaderPromise` is exposed on `globalThis`
- `entry.mjs` awaits `assetsLoaderPromise`
- `entry.mjs` dynamically imports the main program after the assets are ready

That keeps the main program bootable even if asset loading reports errors.

## Assets Loading

- Bundled assets are loaded sequentially with `await file.bytes()`
- Load failures are collected and printed to `stderr`
- Asset loading never rejects the bootstrap promise
- When loading succeeds, the archive is available through `globalThis.internalAssets`

This loader is not zero-copy: it materializes every bundled file in memory and
keeps the resulting bytes in `globalThis.internalAssets`. Large asset archives
can therefore increase startup and ongoing RAM usage. For workloads where that
matters, I also wrote an experimental Linux-only zero-copy hack:
[bun-assets-zerocopy](https://github.com/jjtseng93/bun-assets-zerocopy).

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
