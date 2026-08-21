import { join, posix } from "node:path";
import { existsSync } from "node:fs";
import { IS_COMPILED, REPO_ROOT } from "./compiled.js";
import { pkg } from "./assetsPacker.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

//  This package own namespace inside a shared archive. Matches what
//  `assetsPacker -p` writes, and what `--asset ./build/assets` lands at
//  under /$bunfs/root, so one key reaches either back end.
export const SELF = `assets/${pkg.name}@${pkg.version}`;

//  "" when this build packed flat keys, SELF when it packed namespaced
//  ones. Detected from what is actually there rather than declared by a
//  build flag, which can disagree with the packer and fail silently.
//
//  NOTE: nothing reads this yet; the lookups below are still flat.
//
//  Lazy because the tar back end fills globalThis.internalAssets
//  asynchronously, so module-load time is too early to look.
let detectedPrefix;

export function assetPrefix() {
  if (detectedPrefix === undefined) detectedPrefix = detectPrefix();
  return detectedPrefix;
}

function detectPrefix() {
  const store = getAssetStore();

  if (store) {
    const keys = store instanceof Map ? store.keys() : Object.keys(store);
    for (const key of keys) if (key.startsWith(SELF + "/")) return SELF;
  }

  if (IS_COMPILED && existsSync(join(import.meta.dir, SELF))) return SELF;

  return "";
}

export function hasInternalAssets() {
  return Boolean(getAssetStore());
}

export function assetPath(...parts) {
  return parts
    .flatMap((part) => String(part).split(/[\\/]+/))
    .filter(Boolean)
    .join("/");
}

export function decodeHtmlAttribute(value) {
  return String(value ?? "").replace(
    /&(?:amp|quot|apos|lt|gt|#39|#x27|#\d+|#x[\da-f]+);/gi,
    (entity) => {
      const named = {
        "&amp;": "&",
        "&quot;": "\"",
        "&apos;": "'",
        "&lt;": "<",
        "&gt;": ">",
        "&#39;": "'",
        "&#x27;": "'",
      }[entity.toLowerCase()];
      if (named != null) return named;
      const hex = /^&#x([\da-f]+);$/i.exec(entity);
      const decimal = /^&#(\d+);$/.exec(entity);
      const codePoint = Number.parseInt(hex?.[1] ?? decimal?.[1] ?? "", hex ? 16 : 10);
      try {
        return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
      } catch {
        return entity;
      }
    },
  );
}

export function canonicalHtmlBundleImageHref(input, { htmlAttribute = false } = {}) {
  let value = String(input ?? "");
  if (htmlAttribute) value = decodeHtmlAttribute(value);
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function findHtmlBundleAsset(homepage, publicPath, {
  contentTypePrefix = "",
} = {}) {
  if (!Array.isArray(homepage?.files)) return null;
  const name = posix.basename(String(publicPath ?? "").replace(/[?#].*$/, ""));
  for (const file of homepage.files) {
    if (file?.loader !== "file") continue;
    const contentType = String(file.headers?.["content-type"] ?? "");
    if (contentTypePrefix && !contentType.startsWith(contentTypePrefix)) continue;
    if (posix.basename(String(file.path ?? "")) === name) return file;
  }
  return null;
}

export function findHtmlBundleImageAsset(homepage, publicPath) {
  return findHtmlBundleAsset(homepage, publicPath, {
    contentTypePrefix: "image/",
  });
}

export function htmlBundleImageAssetPath(homepage, publicPath) {
  return findHtmlBundleImageAsset(homepage, publicPath)?.path ?? null;
}

export async function buildHtmlBundleImageMap(
  homepage,
  sourceAttribute = "data-mdcui-src",
) {
  const images = new Map();
  if (!homepage?.index || !Array.isArray(homepage.files)) return images;
  const html = await Bun.file(homepage.index).text();
  for (const tag of html.match(/<img\b[^>]*>/gi) ?? []) {
    const rawHref = htmlTagAttribute(tag, sourceAttribute);
    const publicPath = htmlTagAttribute(tag, "src");
    if (rawHref == null || publicPath == null) continue;
    const bundledPath = htmlBundleImageAssetPath(homepage, decodeHtmlAttribute(publicPath));
    if (!bundledPath) continue;
    images.set(
      canonicalHtmlBundleImageHref(rawHref, { htmlAttribute: true }),
      bundledPath,
    );
  }
  return images;
}

export function listInternalAssetPaths(prefix = "") {
  const store = getAssetStore();
  if (!store) return [];

  const normalizedPrefix = assetPath(prefix);
  const entries = iterateAssetKeys(store);
  if (!normalizedPrefix) {
    return entries.sort();
  }

  const base = `${normalizedPrefix}/`;
  return entries.filter((path) => path === normalizedPrefix || path.startsWith(base)).sort();
}

export function listInternalAssetDirs(prefix = "") {
  const normalizedPrefix = assetPath(prefix);
  const base = normalizedPrefix ? `${normalizedPrefix}/` : "";
  const dirs = new Set();

  for (const path of listInternalAssetPaths(prefix)) {
    const rest = normalizedPrefix ? path.slice(base.length) : path;
    const [dir] = rest.split("/");
    if (dir) dirs.add(dir);
  }

  return [...dirs].sort();
}

export function getInternalAsset(path) {
  const store = getAssetStore();
  if (!store) return null;
  const key = assetPath(path);
  if (store instanceof Map) return store.get(key) ?? null;
  return store[key] ?? store[path] ?? null;
}

export function readInternalAssetBytes(path) {
  const value = getInternalAsset(path);
  if (value == null) return null;
  if (value instanceof Uint8Array) return value;
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (typeof value === "string") return textEncoder.encode(value);
  return textEncoder.encode(String(value));
}

export function readInternalAssetText(path) {
  const bytes = readInternalAssetBytes(path);
  if (!bytes) return null;
  return textDecoder.decode(bytes);
}

export async function readAssetText(path) {
  return readInternalAssetText(path)
    ?? await Bun.file(join(REPO_ROOT, path)).text();
}

export async function readAssetBytes(path) {
  const internal = readInternalAssetBytes(path);
  return internal
    ?? new Uint8Array(await Bun.file(join(REPO_ROOT, path)).arrayBuffer());
}

export function internalAssetSource(path) {
  return {
    name: path.split("/").pop() ?? path,
    path,
    async text() {
      return readInternalAssetText(path) ?? "";
    },
  };
}

function getAssetStore() {
  const store = globalThis.internalAssets;
  if (!store) return null;
  if (store instanceof Map) return store;
  if (typeof store === "object") return store;
  return null;
}

function iterateAssetKeys(store) {
  if (store instanceof Map) return [...store.keys()].map(String);
  return Object.keys(store);
}

function htmlTagAttribute(tag, name) {
  const escapedName = String(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(tag).match(new RegExp(`\\b${escapedName}\\s*=\\s*([\"'])(.*?)\\1`, "i"));
  return match?.[2] ?? null;
}
