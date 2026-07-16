import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tui = join(import.meta.dir, "..", "tui");

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
