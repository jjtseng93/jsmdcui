#!/usr/bin/env bun

//  Change these 2 lines for
//  the relative assets root if needed
import pkg from "../package.json" with { type: "json" };
const ASSETS_ROOT = "..";

import path from "node:path";
import { existsSync } from "node:fs";
import { cpSync, mkdirSync, readdirSync, rmSync, statSync } from "node:fs";

const PKG_ROOT = path.resolve(import.meta.dir, ASSETS_ROOT);

if (process.argv.includes("-h") || process.argv.includes("--help")) {
  console.log(`
Single-file executable assets packer: 
  For packing folders recursively
  -r  Append mode on
  -f  File(.tar) or Folder
    Folder: /path/to/build/assets
    Copies to ${pkg.name}@${pkg.version}
`);
} else if (import.meta.main) {
  await main();
}

export async function main(argv = process.argv) {
  console.log("Packing", pkg.name + "@" + pkg.version);

  let aindex = argv.indexOf("-f");

  const appendMode = argv.includes("-r") || argv.includes("--append");

  //  Namespace for this package's members inside a shared archive.
  //  "-p" alone means `assets/<name>@<version>`, matching what
  //  `bun build --compile --asset ./build/assets` puts in /$bunfs/root
  //  (that flag keeps only the basename of the path it is given), so
  //  both back ends answer to the same keys. Empty (the default) keeps
  //  the flat key space a single-project build expects.
  let pindex = argv.indexOf("-p");
  if (pindex == -1) pindex = argv.indexOf("--prefix");

  const prefix =
    pindex == -1
      ? ""
      : (argv[pindex + 1] ?? "").startsWith("-") || argv[pindex + 1] == null
        ? `assets/${pkg.name}@${pkg.version}`
        : argv[pindex + 1];

  //  A missing value would silently resolve the next flag as a filename
  //  ("-f -r" -> <cwd>/-r), so refuse it rather than pack somewhere odd.
  if (aindex != -1 && (argv[aindex + 1] == null || argv[aindex + 1].startsWith("-"))) {
    console.error("-f needs a file or folder path");
    return 2;
  }

  //  Resolved against the caller's cwd so every later consumer agrees on
  //  what it points at: `mkdir` runs in the process cwd while the copy
  //  loop runs in PKG_ROOT, and a relative -f would mean two places.
  const archive = aindex == -1 ? path.join(import.meta.dir, "assets.tar") : path.resolve(argv[aindex + 1]);

  const folderMode = existsSync(archive) && !(await Bun.file(archive).exists());

  const folderPath = folderMode ? path.join(archive, pkg.name + "@" + pkg.version) : "";

  console.log({
    appendMode,
    archive,
    prefix,
    folderMode,
    folderPath,
    PKG_ROOT,
    assets: pkg.assets,
  });

  if (argv.includes("--dry")) return 0;

  if (folderMode) await Bun.$`mkdir -p ${folderPath}`;

  // No assets field in package.json
  if (!Array.isArray(pkg.assets) || pkg.assets.length == 0) {
    console.error("Nothing to pack!");

    if (folderMode) {
      console.error("Defaults to package.json");
      await Bun.write(path.join(folderPath, "package.json"), JSON.stringify(pkg, null, 1));
    } // assets.tar mode
    else {
      const file = Bun.file(archive);

      //  Leave a real archive alone; only stand one up when it is
      //  missing (or the zero-byte file that is not a valid tar), so
      //  entry.mjs's `with { type: "file" }` import still resolves.
      if ((await file.exists()) && file.size > 0) return 0;

      console.error("Writing a placeholder assets tar");

      await Bun.Archive.write(archive, {
        [`assets/${pkg.name}@${pkg.version}/package.json`]: JSON.stringify(pkg, null, 1),
      });
    }
  } // assets present in package.json
  else {
    if (folderMode) {
      //  Mirror the asset's own relative path, so the folder layout
      //  matches the tar layout. `cp -R src/cui/server.mjs <dir>` would
      //  drop the src/cui/ prefix and land it as <dir>/server.mjs.
      for (let i of pkg.assets) {
        const dest = path.join(folderPath, i);

        mkdirSync(path.dirname(dest), { recursive: true });
        cpSync(path.join(PKG_ROOT, i), dest, { recursive: true });

        console.log(i);
      }
    } // tar mode
    else {
      //  Everything goes through Bun.Archive: system tar is not portable
      //  enough here (toybox has no -r at all, and its --xform exits 0
      //  while writing a corrupt file). Creating is appending to nothing.
      if (!appendMode) rmSync(archive, { force: true });

      return await tar_rvf(archive, pkg.assets, PKG_ROOT, prefix);
    }
  }
} //  end of main

//  Stands in for `tar -rvf`, which toybox tar does not implement.
//  Reads the existing members, adds `filesArray` (paths relative to
//  `cwd`, folders walked recursively), and writes the archive back.
//  Unlike real tar -r, a repacked path replaces its member instead of
//  becoming a second one with the same name.
//
//  `prefix` is prepended to every member name. Member names are built
//  here as plain strings, so this does not depend on tar's --transform
//  (toybox's --xform is broken: it exits 0 and writes a corrupt file).
export async function tar_rvf(archive, filesArray, cwd, prefix = "") {
  const entries = new Map();
  const file = Bun.file(archive);
  const at = prefix ? prefix.replace(/[\\/]+$/, "") + "/" : "";

  if (await file.exists()) {
    const bytes = await file.bytes();

    if (bytes.byteLength > 0)
      for (const [member, blob] of await new Bun.Archive(bytes).files()) entries.set(member, await blob.bytes());
  }

  for (const asset of filesArray) {
    const full = path.join(cwd, asset);

    //  One unreadable path must not take the whole relay down.
    let stat;
    try {
      stat = statSync(full);
    } catch {
      console.error(`Skipping unreadable asset: ${asset}`);
      continue;
    }

    if (!stat.isDirectory()) {
      entries.set(at + asset, await Bun.file(full).bytes());
      console.log(at + asset);
      continue;
    }

    for (const rel of readdirSync(full, { recursive: true })) {
      const child = path.join(full, String(rel));

      //  statSync follows symlinks, so a dangling one throws here.
      let childStat;
      try {
        childStat = statSync(child);
      } catch {
        continue;
      }
      if (!childStat.isFile()) continue;

      const member = at + asset + "/" + String(rel).split(path.sep).join("/");
      entries.set(member, await Bun.file(child).bytes());
      console.log(member);
    }
  }

  await Bun.Archive.write(archive, Object.fromEntries(entries));

  return 0;
}
