import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tui = join(import.meta.dir, "..", "tui");

async function runCheck(markdown) {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-check-"));
  const file = join(dir, "app.md");
  await writeFile(file, markdown);
  const result = Bun.spawnSync([tui, "--check", file], { stdout: "pipe", stderr: "pipe" });
  await rm(dir, { recursive: true, force: true });
  return result;
}

test("--check exits 0 and reports unique IDs", async () => {
  const result = await runCheck("## Input Path\n\n```text#output-path\nvalue\n```\n");
  expect(result.exitCode).toBe(0);
  const raw = result.stdout.toString();
  const output = Bun.stripANSI(raw);
  expect(output).toContain("No ID collisions found");
  expect(output).toContain("PASSED");
  expect(raw).toContain(`${Bun.color("#00d75f", "ansi-16m")}\x1b[1mPASSED\x1b[0m`);
});

test("--check reports heading/fenced-block collisions with line details", async () => {
  const result = await runCheck("## Write Status\n\n```text#write-status\nwaiting\n```\n");
  const output = Bun.stripANSI(result.stdout.toString());
  expect(result.exitCode).toBe(1);
  expect(output).toContain("FAIL — Found 1 colliding ID(s)");
  expect(output).toContain("ID #write-status");
  expect(output).toContain("Declarations: 2");
  expect(output).toContain("Line 1");
  expect(output).toContain("Type: heading");
  expect(output).toContain("Source: ## Write Status");
  expect(output).toContain("Line 3");
  expect(output).toContain("Type: text fenced block");
  expect(output).toContain("Source: ```text#write-status");
  expect(result.stdout.toString()).toContain(`${Bun.color("#ff3030", "ansi-16m")}\x1b[1mFAILED\x1b[0m`);
  expect(output.lastIndexOf("FAILED")).toBeGreaterThan(output.lastIndexOf("Suggested fix"));
});

test("--check reports duplicate fenced-block IDs", async () => {
  const result = await runCheck("```text#same\na\n```\n\n```textarea#same\nb\n```\n");
  expect(result.exitCode).toBe(1);
  const output = Bun.stripANSI(result.stdout.toString());
  expect(output).toContain("ID #same");
  expect(output).toContain("Declarations: 2");
});

test("--check includes IDs on arbitrary fenced-block tags", async () => {
  const result = await runCheck("```hello#myid\nyou\n```\n\n# myid\n");
  const output = Bun.stripANSI(result.stdout.toString());
  expect(result.exitCode).toBe(1);
  expect(output).toContain("ID #myid");
  expect(output).toContain("Type: hello fenced block");
  expect(output).toContain("Fenced blocks: 1");
});

test("--check requires exactly one file", () => {
  const result = Bun.spawnSync([tui, "--check"], { stdout: "pipe", stderr: "pipe" });
  expect(result.exitCode).toBe(2);
  expect(result.stderr.toString()).toContain("Usage: jsmdcui --check FILE.md");
});
