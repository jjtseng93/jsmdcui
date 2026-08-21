import { basename, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import child_process from "node:child_process";
import { ASSETS_ROOT } from "./assetsPacker.js";


export const IS_COMPILED = isCompiledBinary();
export const REPO_ROOT = IS_COMPILED
  ? getExeDirname()
  : resolve(import.meta.dirname, ASSETS_ROOT);
//  This file's own directory. Not derived from REPO_ROOT: the only user
//  is buildExecutable(), which already refuses to run when IS_COMPILED,
//  so REPO_ROOT there is always the source tree, and going back down
//  through it would hard-code this folder name.
const SINGLE_EXE_DIR = import.meta.dirname;


export function isCompiledBinary(argv = process.argv) {
  const entry = argv?.[1];
  return Boolean(
    entry?.startsWith?.("/$bunfs/") ||
    entry?.startsWith?.("B:/~BUN")
  );
}

export function getExeDirname() {
  const argv = process.argv
  const execPath = process.execPath
  
  const bn = basename(execPath);
  if (bn.startsWith("ld") || 
      bn.startsWith("libld") ||
      bn.startsWith("linker") ) {
    const realArgv = readFileSync("/proc/self/cmdline", "utf8").match(/[^\0]+/g);
    return dirname(realArgv?.[1] ?? execPath);
  }
  return dirname(execPath) || process.cwd();
}

export function getDirnameFromUrl(importMetaUrl) {
  return dirname(fileURLToPath(importMetaUrl));
}

export function stringifyNonPrimitiveDefineValues(argv, name) {
  const definePrefix = `${name}=`;
  const numberLiteral = /^[+-]?(?:(?:0[xX][\dA-Fa-f](?:_?[\dA-Fa-f])*)|(?:0[bB][01](?:_?[01])*)|(?:0[oO][0-7](?:_?[0-7])*)|(?:(?:\d(?:_?\d)*)(?:\.(?:\d(?:_?\d)*)?)?|\.(?:\d(?:_?\d)*))(?:[eE][+-]?\d(?:_?\d)*)?)$/;

  // Parse scalar literals as data. Never evaluate a user-provided expression.
  const normalize = (definition) => {
    if (!definition.startsWith(definePrefix)) return definition;
    const source = definition.slice(definePrefix.length);
    const trimmed = source.trim();
    let value;
    let parsed = false;

    try {
      value = JSON.parse(source);
      parsed = true;
    } catch {
      try {
        if (globalThis.Bun?.JSON5) {
          value = globalThis.Bun.JSON5.parse(source);
          parsed = true;
        }
      } catch {}
    }

    if (parsed && typeof value === "string") {
      return definePrefix + JSON.stringify(value);
    }
    if (
      (parsed && (
        value === null
        || typeof value === "number"
        || typeof value === "boolean"
      ))
      || trimmed === "undefined"
      || numberLiteral.test(trimmed)
    ) {
      return definition;
    }
    return definePrefix + JSON.stringify(source);
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--define" && typeof argv[i + 1] === "string") {
      argv[i + 1] = normalize(argv[i + 1]);
    } else if (argv[i]?.startsWith?.("--define=")) {
      argv[i] = "--define="
        + normalize(argv[i].slice("--define=".length));
    }
  }
  return argv;
}

export async function buildExecutable(target = "",build_outfile="single.exe", bunArgs = []) {
 
  let outfile = resolve(process.cwd(), build_outfile);
  const normalizedTarget = String(target || "").trim();
  const extraBunArgs = Array.from(bunArgs ?? [], String);
  if(!globalThis.Bun || IS_COMPILED)
  {
    console.log("Build exe can only be run by Bun in the source tree");
    return 1;
  }
  
  let bunBin=Bun.which('bun') || process.argv0;

  const steps = [
    {
      label: "Pack assets",
      cwd: SINGLE_EXE_DIR,
      cmd: bunBin,
      args: ["./packAssets.sh"],
    },
    {
      label: "Compile executable",
      cwd: SINGLE_EXE_DIR,
      cmd: bunBin,
      args: [
        "build",
        "--format=esm",
        "--compile",
        "--minify",
        "--bytecode",
        "./entry.mjs",
        `--outfile=${outfile}`,
        `--metafile-md=${outfile}.meta.md`,
        ...(normalizedTarget ? [`--target=${normalizedTarget}`] : []),
        ...extraBunArgs,
      ],
    },
  ];

  for (const step of steps) {
  
    console.log('');
    console.log(Bun?.markdown?.ansi?.('## '+step.label)||step.label); 
    
    console.log("Running: ",step.cmd,step.args)
  
    const result = child_process.spawnSync(step.cmd, step.args, {
      cwd: step.cwd,
      stdio: "inherit",
      env: process.env,
    });
    
    console.log("");
    console.log(Bun?.markdown?.ansi?.(
      '- Status: '+result.status+' for '+step.label
    )||result.status);



    if (result.error || result.status !== 0) {
    
      if (result.error) {
        console.error(result.error);
      }
      
      if (step.label == "Pack assets") {
        console.log("Pack assets failed; continuing with the existing assets.tar if available");
      }
      
    }
    
    
  }  //  for steps of build

  const isWindows = normalizedTarget
    ? normalizedTarget.toLowerCase().includes("windows")
    : process.platform === "win32";
  if (isWindows && !outfile.toLowerCase().endsWith(".exe")) {
    outfile += ".exe";
  }
  if(await Bun.file(outfile).exists())
  {
    console.log(`Built executable: ${outfile}`);
    return 0;
  }
  else
  {
    console.log(`Error while building executable: ${outfile}`);
    return 1;
  }
}

export const buildExe = buildExecutable;

export async function buildEarlyExit(argv,build_outfile) {
  argv = argv || process.argv

  const buildExeIndex = argv.indexOf("--build-exe");
  const buildForIndex = argv.indexOf("--build-for");

  if (buildExeIndex === -1 && buildForIndex === -1) {
    return false;
  }
  
  if (IS_COMPILED) {
    console.error("--build-exe & --build-for are only available in the source tree");
    process.exit(1);
  }

  if (buildForIndex !== -1) {
    const target = argv[buildForIndex + 1];
    if (!target || target.startsWith("-")) {
      console.error("Missing target value for --build-for");
      process.exit(2);
    }
    process.exit(await buildExe(target, build_outfile, argv.slice(buildForIndex + 2)));
  }

  process.exit(await buildExe(null, build_outfile, argv.slice(buildExeIndex + 1)));
}
