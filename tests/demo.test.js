import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tui = join(import.meta.dir, "..", "tui");

test("--help describes the non-overwriting demo behavior", () => {
  const result = Bun.spawnSync([tui, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  const output = result.stdout.toString();
  expect(output).toContain("use the existing ./testapp.md without overwriting it");
  expect(output).toContain("If ./testapp.md is missing, write the bundled demo there first");
});

test("--demo writes bundled testapp.md to cwd before opening it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-"));
  try {
    const result = Bun.spawnSync([tui, "--demo", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "testapp.md"), "utf8");
    expect(written).toContain("# jsmdcui");
    expect(Bun.stripANSI(result.stdout.toString())).toContain("jsmdcui");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo preserves an existing testapp.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-existing-"));
  const existing = "# Keep my demo\n";
  try {
    await writeFile(join(dir, "testapp.md"), existing);
    const result = Bun.spawnSync([tui, "--demo", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(dir, "testapp.md"), "utf8")).toBe(existing);
    expect(Bun.stripANSI(result.stdout.toString())).toContain("Keep my demo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
