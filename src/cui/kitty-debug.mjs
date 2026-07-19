import { appendFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const KITTY_DEBUG_LOG = resolve(import.meta.dir, "../..", "kitty-placement.log");

try {
  writeFileSync(KITTY_DEBUG_LOG, "");
} catch {}

export function logKittyPlacement(stage, details = {}) {
  try {
    appendFileSync(KITTY_DEBUG_LOG, JSON.stringify({
      time: new Date().toISOString(),
      pid: process.pid,
      stage,
      ...details,
    }) + "\n");
  } catch {}
}
