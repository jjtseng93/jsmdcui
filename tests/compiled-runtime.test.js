import { expect, test } from "bun:test";
import {
  isCompiledBinary as isSingleExeCompiled,
  stringifyNonPrimitiveDefineValues,
} from "../single-exe/compiled.js";

test("single-exe recognizes Bun compiled virtual paths", () => {
  expect(isSingleExeCompiled(["bun", "/$bunfs/root/app.js"])).toBe(true);
  expect(isSingleExeCompiled(["bun", "B:/~BUN/root/app.js"])).toBe(true);
  expect(isSingleExeCompiled(["bun", "/project/src/index.js"])).toBe(false);
});

test("non-primitive MDCUI_MAIN define values become strings", () => {
  const split = [
    "bun",
    "src/index.js",
    "--build-exe",
    "--define",
    "global.MDCUI_MAIN=../中文=工具.md",
  ];
  expect(
    stringifyNonPrimitiveDefineValues(split, "global.MDCUI_MAIN"),
  ).toBe(split);
  expect(split.at(-1)).toBe(
    'global.MDCUI_MAIN="../中文=工具.md"',
  );

  const inline = [
    "--define=global.MDCUI_MAIN=../m.md",
    "--define",
    "OTHER=../other.md",
    "--define",
    "global.MDCUI_MAIN_BASE=m.md",
  ];
  stringifyNonPrimitiveDefineValues(inline, "global.MDCUI_MAIN");
  expect(inline).toEqual([
    '--define=global.MDCUI_MAIN="../m.md"',
    "--define",
    "OTHER=../other.md",
    "--define",
    "global.MDCUI_MAIN_BASE=m.md",
  ]);

  for (const source of ["", "[]", "{}", "makePath()"]) {
    const argv = ["--define", `global.MDCUI_MAIN=${source}`];
    stringifyNonPrimitiveDefineValues(argv, "global.MDCUI_MAIN");
    expect(argv[1]).toBe(
      `global.MDCUI_MAIN=${JSON.stringify(source)}`,
    );
  }
});

test("primitive MDCUI_MAIN define values keep their type", () => {
  const cases = new Map([
    ['"../m.md"', '"../m.md"'],
    ["'../m.md'", '"../m.md"'],
    ["true", "true"],
    ["false", "false"],
    ["null", "null"],
    ["undefined", "undefined"],
    ["0", "0"],
    ["-1.5", "-1.5"],
    ["NaN", "NaN"],
    ["Infinity", "Infinity"],
    ["0xff", "0xff"],
    ["0b10", "0b10"],
    ["1_000", "1_000"],
  ]);

  for (const [source, normalized] of cases) {
    const argv = ["--define", `global.MDCUI_MAIN=${source}`];
    stringifyNonPrimitiveDefineValues(argv, "global.MDCUI_MAIN");
    expect(argv[1]).toBe(`global.MDCUI_MAIN=${normalized}`);
  }
});
