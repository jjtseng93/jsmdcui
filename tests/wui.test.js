import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkdownInput, writeRuntimeFiles } from "../runmd.mjs";

test("WUI writes the bundled testapp.md when it is missing", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-wui-"));
  const mdpath = join(dir, "testapp.md");
  try {
    const source = await readMarkdownInput(mdpath);
    expect(source).toContain("# jsmdcui");
    expect(await readFile(mdpath, "utf8")).toBe(source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WUI preserves an existing testapp.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-wui-existing-"));
  const mdpath = join(dir, "testapp.md");
  const existing = "# Keep my WUI demo\n";
  try {
    await writeFile(mdpath, existing);
    expect(await readMarkdownInput(mdpath)).toBe(existing);
    expect(await readFile(mdpath, "utf8")).toBe(existing);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("generated WUI server falls back to a system port when 3000 is occupied", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-wui-port-"));
  const mdpath = join(dir, "app.md");
  try {
    await writeRuntimeFiles(mdpath);
    const source = await readFile(`${mdpath}-server.js`, "utf8");
    expect(source).toContain('error?.code === "EADDRINUSE"');
    expect(source).toContain('serverOptions.port !== 3000 || !addressInUse');
    expect(source).toContain('Bun.serve({ ...serverOptions, port: 0 })');
    expect(source).toContain('localhost:${server.port}');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
