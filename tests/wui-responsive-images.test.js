import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createWui } from "../runmd.mjs";

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("createWui constrains images to their content width", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jsmdcui-wui-image-"));
  temporaryDirectories.push(directory);
  const markdownPath = join(directory, "image.md");
  const html = await createWui("![wide](wide.png)", markdownPath);

  expect(html).toContain("img {\n  max-width: 100%;\n  height: auto;\n}");
  expect(html.match(/max-width: 100%/g)).toHaveLength(1);
  expect(html.match(/image\.md\.front\.js/g)).toHaveLength(1);
});

test("createWui injects the image rule into an existing document head", async () => {
  const directory = mkdtempSync(join(tmpdir(), "jsmdcui-wui-document-"));
  temporaryDirectories.push(directory);
  const markdownPath = join(directory, "document.md");
  const source = "<!doctype html><html><head><title>x</title></head><body><img src=\"wide.png\"></body></html>";
  const html = await createWui(source, markdownPath);

  expect(html.indexOf("max-width: 100%")).toBeLessThan(html.indexOf("</head>"));
  expect(html.match(/document\.md\.front\.js/g)).toHaveLength(1);
});
