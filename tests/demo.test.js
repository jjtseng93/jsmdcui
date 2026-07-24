import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readMarkdownInput } from "../runmd.mjs";

const tui = join(import.meta.dir, "..", "tui");
const bunBin = Bun.which("bun") || process.argv0;

test("--help describes the non-overwriting demo behavior", () => {
  const result = Bun.spawnSync([bunBin, tui, "--help"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  const output = result.stdout.toString();
  expect(output).toContain("use the existing ./testapp.md without overwriting it");
  expect(output).toContain("If ./testapp.md is missing, write the bundled demo there first");
  expect(output).toContain("--demo-<filename>");
  expect(output).toContain("demos/<filename>.md");
  expect(output.match(/Open it in the TUI and write 5 generated files beside it/g)?.length).toBe(2);
  expect(output).toContain("--demo-imgtool");
  expect(output).toContain("--demo-imgtool-zh");
  expect(output).toContain("--cdp-maze");
});

test("--demo-list lists root and automatically discovered demos", () => {
  const result = Bun.spawnSync([bunBin, tui, "--demo-list"], {
    stdout: "pipe",
    stderr: "pipe",
  });

  expect(result.exitCode).toBe(0);
  const output = result.stdout.toString();
  expect(output).toMatch(/--demo\s+testapp\.md/);
  expect(output).toMatch(/--demo-image-processor\s+demos\/image-processor\.md/);
  expect(output).toMatch(/--demo-select\s+demos\/select\.md/);
  expect(output).toMatch(/--demo-todo-zh\s+demos\/todo-zh\.md/);
  expect(output).toContain("--demo-imgtool     --demo-image-processor");
});

test("--export-cdp-maze writes and overwrites the bundled solver", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-export-cdp-maze-"));
  const outputPath = join(dir, "cdp-maze.js");
  try {
    await writeFile(outputPath, "old solver\n");
    const result = Bun.spawnSync([bunBin, tui, "--export-cdp-maze"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.toString()).toContain(`Wrote ${outputPath}`);
    const exported = await readFile(outputPath, "utf8");
    expect(exported).toContain("export async function runCdpMaze");
    expect(exported).not.toContain("old solver");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo writes bundled testapp.md to cwd before opening it", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-"));
  try {
    const result = Bun.spawnSync([bunBin, tui, "--demo", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "testapp.md"), "utf8");
    expect(written).toContain("計算機");
    expect(Bun.stripANSI(result.stdout.toString())).toContain("計算機");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo preserves an existing testapp.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-existing-"));
  const existing = "# Keep my demo\n";
  try {
    await writeFile(join(dir, "testapp.md"), existing);
    const result = Bun.spawnSync([bunBin, tui, "--demo", "-cat", "-encoding", "utf8"], {
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

test("--overwrite-demo replaces an existing demo with the bundled copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-overwrite-"));
  const existing = "# Replace my demo\n";
  try {
    await writeFile(join(dir, "testapp.md"), existing);
    const result = Bun.spawnSync(
      [bunBin, tui, "--overwrite-demo", "--demo", "-cat", "-encoding", "utf8"],
      {
        cwd: dir,
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "testapp.md"), "utf8");
    expect(written).toContain("計算機");
    expect(written).not.toBe(existing);
    expect(Bun.stripANSI(result.stdout.toString())).toContain("計算機");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("WUI demo loading can overwrite an existing testapp.md", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-wui-demo-overwrite-"));
  const demoPath = join(dir, "testapp.md");
  try {
    await writeFile(demoPath, "# Replace my WUI demo\n");
    const source = await readMarkdownInput(demoPath, true);

    expect(source).toContain("計算機");
    expect(await readFile(demoPath, "utf8")).toBe(source);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-<filename> automatically loads a matching demos file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-generic-"));
  try {
    const result = Bun.spawnSync([bunBin, tui, "--demo-todo", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "todo.md"), "utf8");
    expect(written).toContain("# Todo List");
    expect(written).toContain("javascript:addTodo()");
    expect(Bun.stripANSI(result.stdout.toString())).toContain("Show Completed");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--cdp-maze loads the maze demo", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-cdp-maze-"));
  try {
    const result = Bun.spawnSync([bunBin, tui, "--cdp-maze", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    const written = await readFile(join(dir, "maze.md"), "utf8");
    expect(written).toContain("Put the cursor here");
    expect(Bun.stripANSI(result.stdout.toString())).toContain("Put the cursor here");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-<filename> preserves an existing local copy", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-generic-existing-"));
  const existing = "# Keep my selector demo\n";
  try {
    await writeFile(join(dir, "select.md"), existing);
    const result = Bun.spawnSync([bunBin, tui, "--demo-select", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(dir, "select.md"), "utf8")).toBe(existing);
    expect(Bun.stripANSI(result.stdout.toString())).toContain("Keep my selector demo");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("an unknown --demo-<filename> reports an error without creating a file", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-demo-unknown-"));
  try {
    const result = Bun.spawnSync([bunBin, tui, "--demo-does-not-exist", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(2);
    expect(result.stderr.toString()).toContain("Unknown demo --demo-does-not-exist");
    expect(await Bun.file(join(dir, "does-not-exist.md")).exists()).toBe(false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-image-processor works through generic demo discovery", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-imgtool-generic-"));
  try {
    const result = Bun.spawnSync([bunBin, tui, "--demo-image-processor", "-cat", "-encoding", "utf8"], {
      cwd: dir,
      stdout: "pipe",
      stderr: "pipe",
    });

    expect(result.exitCode).toBe(0);
    expect(await readFile(join(dir, "image-processor.md"), "utf8")).toContain("# Bun.Image Processor");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("--demo-imgtool writes the bundled image processor to cwd", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-imgtool-"));
  try {
    const result = Bun.spawnSync([bunBin, tui, "--demo-imgtool", "-cat", "-encoding", "utf8"], {
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
    const result = Bun.spawnSync([bunBin, tui, "--demo-imgtool", "-cat", "-encoding", "utf8"], {
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
    const result = Bun.spawnSync([bunBin, tui, "--demo-imgtool-zh", "-cat", "-encoding", "utf8"], {
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
    const result = Bun.spawnSync([bunBin, tui, "--demo-imgtool-zh", "-cat", "-encoding", "utf8"], {
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
