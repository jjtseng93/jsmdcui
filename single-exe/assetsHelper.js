import { join, posix } from "node:path";
import { REPO_ROOT } from "./compiled.js";

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

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
