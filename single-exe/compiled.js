import { basename, dirname, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import child_process from "node:child_process";


export const IS_COMPILED = isCompiledBinary();
export const REPO_ROOT = IS_COMPILED
  ? getExeDirname()
  : resolve(import.meta.dirname, "..");
const SINGLE_EXE_DIR = resolve(REPO_ROOT, "single-exe");
const SINGLE_EXE_ENTRY = resolve(SINGLE_EXE_DIR, "entry.mjs");


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

export async function buildExecutable(target = "",build_outfile="single.exe", bunArgs = []) {
 
  const outfile = resolve(process.cwd(), build_outfile);
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
