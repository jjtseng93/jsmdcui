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
