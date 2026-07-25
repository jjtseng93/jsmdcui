import { expect, test } from "bun:test";
import { buildMicroGlobal } from "../src/plugins/js-bridge.js";

test("micro prompt APIs delegate and return synchronously", () => {
  const previousMicro = globalThis.micro;
  const previousSelector = globalThis.$;
  const calls = [];
  const app = {
    protectedAlert(message) {
      calls.push(["alert", message]);
      return undefined;
    },
    protectedConfirm(message) {
      calls.push(["confirm", message]);
      return true;
    },
    protectedPrompt(message, defaultValue) {
      calls.push(["prompt", message, defaultValue]);
      return "answer";
    },
  };

  try {
    const micro = buildMicroGlobal({ _app: app, _ctx: null, on() {} });
    const alertResult = micro.alert("hello");
    const confirmResult = micro.confirm("continue?");
    const promptResult = micro.prompt("name", "Ada");

    expect(alertResult).toBeUndefined();
    expect(confirmResult).toBe(true);
    expect(promptResult).toBe("answer");
    expect(alertResult?.then).toBeUndefined();
    expect(confirmResult?.then).toBeUndefined();
    expect(promptResult?.then).toBeUndefined();
    expect(calls).toEqual([
      ["alert", "hello"],
      ["confirm", "continue?"],
      ["prompt", "name", "Ada"],
    ]);
  } finally {
    if (previousMicro === undefined) delete globalThis.micro;
    else globalThis.micro = previousMicro;
    if (previousSelector === undefined) delete globalThis.$;
    else globalThis.$ = previousSelector;
  }
});

test("current buffer exposes its actual MDCUI module source", () => {
  const previousMicro = globalThis.micro;
  const previousSelector = globalThis.$;
  const previousMain = global.MDCUI_MAIN;
  const buffer = {
    path: "/tmp/app.md",
    _useBundledMdcuiModules: true,
  };
  const app = { buffer };

  try {
    global.MDCUI_MAIN = "/build/app.md";
    const micro = buildMicroGlobal({ _app: app, _ctx: null, on() {} });

    expect(micro.CurPane().Buf.MdcuiModuleSource).toBe("embedded");
    buffer._useBundledMdcuiModules = false;
    expect(micro.CurPane().Buf.MdcuiModuleSource).toBe("external");
    delete global.MDCUI_MAIN;
    buffer._useBundledMdcuiModules = true;
    expect(micro.CurPane().Buf.MdcuiModuleSource).toBe("external");
  } finally {
    if (previousMain === undefined) delete global.MDCUI_MAIN;
    else global.MDCUI_MAIN = previousMain;
    if (previousMicro === undefined) delete globalThis.micro;
    else globalThis.micro = previousMicro;
    if (previousSelector === undefined) delete globalThis.$;
    else globalThis.$ = previousSelector;
  }
});
