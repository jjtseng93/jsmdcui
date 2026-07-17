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
  expect(output).toContain("--demo-imgtool");
  expect(output).toContain("--demo-imgtool-zh");
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

test("--demo-imgtool writes the bundled image processor to cwd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-imgtool-"));
  try {
    const result = Bun.spawnSync([tui, "--demo-imgtool", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "image-processor.md"), "utf8");
    expect(written).toContain("# Bun.Image Processor");
    expect(written).toContain("javascript:readMetadata()");
    expect(Bun.stripANSI(result.stdout.toString())).toContain("Bun.Image Processor");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-imgtool preserves an existing image-processor.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-imgtool-existing-"));
  const existing = "# Keep my image tool\n";
  try {
    await writeFile(join(dir, "image-processor.md"), existing);
    const result = Bun.spawnSync([tui, "--demo-imgtool", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(dir, "image-processor.md"), "utf8")).toBe(existing);
    expect(Bun.stripANSI(result.stdout.toString())).toContain("Keep my image tool");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-imgtool-zh writes the bundled Traditional Chinese image processor to cwd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-imgtool-zh-"));
  try {
    const result = Bun.spawnSync([tui, "--demo-imgtool-zh", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "image-processor.zh-TW.md"), "utf8");
    expect(written).toContain("先把本機圖片路徑貼到下方");
    expect(written).toContain("javascript:readMetadata()");
    expect(Bun.stripANSI(result.stdout.toString())).toContain("先把本機圖片路徑貼到下方");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-imgtool-zh preserves an existing image-processor.zh-TW.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-imgtool-zh-existing-"));
  const existing = "# 保留我的圖片工具\n";
  try {
    await writeFile(join(dir, "image-processor.zh-TW.md"), existing);
    const result = Bun.spawnSync([tui, "--demo-imgtool-zh", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(dir, "image-processor.zh-TW.md"), "utf8")).toBe(existing);
    expect(Bun.stripANSI(result.stdout.toString())).toContain("保留我的圖片工具");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
