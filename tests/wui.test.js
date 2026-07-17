import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkdownInput } from "../runmd.mjs";

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
