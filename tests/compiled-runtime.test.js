import { expect, test } from "bun:test";
import { isCompiledBinary as isSingleExeCompiled } from "../single-exe/compiled.js";

test("single-exe recognizes Bun compiled virtual paths", () => {
  expect(isSingleExeCompiled(["bun", "/$bunfs/root/app.js"])).toBe(true);
  expect(isSingleExeCompiled(["bun", "B:/~BUN/root/app.js"])).toBe(true);
  expect(isSingleExeCompiled(["bun", "/project/src/index.js"])).toBe(false);
});
