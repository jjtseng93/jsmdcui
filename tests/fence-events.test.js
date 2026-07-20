import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fenceEventMap, inlineFenceEventCode, parseFenceDeclarations } from "../src/cui/fence-events.mjs";
import { evalFront } from "../src/cui/rpc.mjs";
import { buildTuiBlockIndex, findTuiBlockAtLine, findTuiBlockInIndex } from "../src/plugins/js-bridge.js";
import { convertWuiTextareas } from "../runmd.mjs";

const tui = join(import.meta.dir, "..", "tui");
const bunBin = Bun.which("bun") || process.argv0;

async function waitFor(check, timeout = 5000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (check()) return;
    await Bun.sleep(20);
  }
  throw new Error("timed out waiting for PTY output");
}

test("fenced text controls retain quoted inline keydown code after the identity", () => {
  const markdown = '```text#myid.field @keydown="first(); second(event); show(\\"done\\")"\nvalue\n```\n';
  const declarations = parseFenceDeclarations(markdown);
  expect(declarations).toHaveLength(1);
  expect(declarations[0]).toMatchObject({
    tag: "text",
    id: "myid",
    classes: ["field"],
  });
  expect(declarations[0].events.get("keydown")).toEqual({
    code: 'first(); second(event); show("done")',
    modifiers: [],
  });
});

test("prevent modifier prepends preventDefault to inline event code", () => {
  const markdown = '```text#myid @keydown.prevent="submit(event)"\nvalue\n```\n';
  const handler = fenceEventMap(markdown).get("myid").events.get("keydown");
  expect(handler).toEqual({ code: "submit(event)", modifiers: ["prevent"] });
  expect(inlineFenceEventCode(handler)).toBe("event.preventDefault();submit(event)");
});

test("WUI writes keyboard code as native inline handlers with a mobile beforeinput fallback", () => {
  const markdown = '```text#myid.field @keydown.prevent="guard(event)"\nvalue\n```\n';
  const html = convertWuiTextareas(Bun.markdown.html(markdown), fenceEventMap(markdown));
  expect(html).toContain('id="myid"');
  expect(html).toContain('const __mdcuiKeyCode=Number(event.keyCode||event.which||0);');
  expect(html).toContain('if(event.key!==&quot;Unidentified&quot;){\nObject.defineProperty(event,&quot;toJSON&quot;');
  expect(html).toContain('event.preventDefault();guard(event)\n}"');
  expect(html).toContain('onbeforeinput="if(!this.__mdcuiIdentifiedKeydown&amp;&amp;event.data!=null');
  expect(html).toContain('ctrlKey:{configurable:true,value:!!m.ctrlKey}');
  expect(html).toContain('metaKey:{configurable:true,value:!!m.metaKey}');
  expect(html).not.toContain("onkeyup=");
  expect(html).not.toContain("addEventListener");
});

test("keyup declarations are unsupported in both interfaces", () => {
  const markdown = '```text#myid @keyup="update(event)"\nvalue\n```\n';
  const declarations = parseFenceDeclarations(markdown);
  const html = convertWuiTextareas(Bun.markdown.html(markdown), fenceEventMap(markdown));
  expect(declarations[0].events.size).toBe(0);
  expect(fenceEventMap(markdown).has("myid")).toBeFalse();
  expect(html).not.toContain("onkeyup=");
  expect(html).not.toContain("onkeydown=");
});

test("WUI keeps a trailing line comment inside the generated keydown block", () => {
  const markdown = '```text#myid @keydown="guard(event); // trailing comment"\nvalue\n```\n';
  const html = convertWuiTextareas(Bun.markdown.html(markdown), fenceEventMap(markdown));
  const code = (html.match(/onkeydown="([^"]*)"/)?.[1] ?? "")
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
  expect(() => new Function("event", "guard", code)).not.toThrow();
});

test("WUI restores modifier letters from keyCode or code during keydown", () => {
  const markdown = '```text#myid @keydown.prevent="guard(event)"\nvalue\n```\n';
  const html = convertWuiTextareas(Bun.markdown.html(markdown), fenceEventMap(markdown));
  const decodeAttribute = (value) => value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
  const keydownCode = decodeAttribute(html.match(/onkeydown="([^"]*)"/)?.[1] ?? "");
  const beforeInputCode = decodeAttribute(html.match(/onbeforeinput="([^"]*)"/)?.[1] ?? "");
  const seen = [];
  const element = {};
  const runKeydown = new Function("event", "guard", keydownCode);
  element.onkeydown = (event) => runKeydown.call(element, event, (current) => seen.push({
    key: current.key,
    ctrlKey: current.ctrlKey,
    shiftKey: current.shiftKey,
    altKey: current.altKey,
    metaKey: current.metaKey,
    json: JSON.parse(JSON.stringify(current)),
    toJSONEnumerable: Object.keys(current).includes("toJSON"),
  }));

  const unidentified = {
    key: "ß",
    keyCode: 0,
    code: "KeyS",
    ctrlKey: true,
    shiftKey: false,
    altKey: true,
    metaKey: true,
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  element.onkeydown(unidentified);
  expect(unidentified.defaultPrevented).toBeTrue();
  expect(unidentified.key).toBe("s");

  const beforeInput = {
    data: "β",
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  new Function("event", beforeInputCode).call(element, beforeInput);
  expect(seen).toEqual([{
    key: "s",
    ctrlKey: true,
    shiftKey: false,
    altKey: true,
    metaKey: true,
    json: {
      type: "",
      key: "s",
      code: "KeyS",
      raw: "",
      ctrlKey: true,
      shiftKey: false,
      altKey: true,
      metaKey: true,
      repeat: false,
      defaultPrevented: true,
      target: { id: "", tagName: "", className: "", value: "" },
    },
    toJSONEnumerable: false,
  }]);
  expect(beforeInput.key).toBeUndefined();
  expect(beforeInput.defaultPrevented).toBeFalse();
  clearTimeout(element.__mdcuiKeydownReset);
});

test("WUI beforeinput keeps composed text for AltGraph and unmodified input", () => {
  const markdown = '```text#myid @keydown="guard(event)"\nvalue\n```\n';
  const html = convertWuiTextareas(Bun.markdown.html(markdown), fenceEventMap(markdown));
  const decodeAttribute = (value) => value
    .replaceAll("&quot;", '"')
    .replaceAll("&gt;", ">")
    .replaceAll("&lt;", "<")
    .replaceAll("&amp;", "&");
  const keydownCode = decodeAttribute(html.match(/onkeydown="([^"]*)"/)?.[1] ?? "");
  const beforeInputCode = decodeAttribute(html.match(/onbeforeinput="([^"]*)"/)?.[1] ?? "");
  const seen = [];
  const element = {};
  const runKeydown = new Function("event", "guard", keydownCode);
  element.onkeydown = (event) => runKeydown.call(element, event, current => seen.push(current.key));
  const retry = (keydown, data) => {
    element.onkeydown({ key: "Unidentified", ...keydown });
    new Function("event", beforeInputCode).call(element, { data });
  };

  retry({ keyCode: 83, altKey: true, getModifierState: name => name === "AltGraph" }, "β");
  retry({ keyCode: 83 }, "絲");

  expect(seen).toEqual(["β", "絲"]);
  clearTimeout(element.__mdcuiKeydownReset);
});

test("TUI finds the event target only while the cursor is inside the framed body", () => {
  const lines = ["┌─ text#myid.field", "│ value", "└─"];
  expect(findTuiBlockAtLine(lines, 0)).toBeNull();
  expect(findTuiBlockAtLine(lines, 1)?.header).toMatchObject({ tag: "text", id: "myid" });
  expect(findTuiBlockAtLine(lines, 2)).toBeNull();
});

test("TUI keyboard lookup indexes event blocks once and uses binary lookup", () => {
  const lines = [
    "heading",
    "┌─ text#plain",
    "│ no event",
    "└─",
    ...Array.from({ length: 5_000 }, (_, index) => `line ${index}`),
    "┌─ text#target",
    "│ event body",
    "└─",
  ];
  const declarations = new Map([
    ["target", { tag: "text", events: new Map([["keydown", { code: "hit()" }]]) }],
  ]);
  const blocks = buildTuiBlockIndex(lines, declarations);

  expect(blocks).toHaveLength(1);
  expect(blocks[0].header).toMatchObject({ tag: "text", id: "target" });
  expect(findTuiBlockInIndex(blocks, lines.length - 2)).toBe(blocks[0]);
  expect(findTuiBlockInIndex(blocks, 2)).toBeNull();
});

test("front evaluation exposes the TUI event scope to inline statements", async () => {
  const seen = [];
  const event = { key: "Enter" };
  const result = await evalFront(
    { record(value) { seen.push(value); } },
    "record(event.key)",
    { event },
  );
  expect(result).toBeUndefined();
  expect(seen).toEqual(["Enter"]);
});

test("TUI keydown.prevent runs before editing and blocks text input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-keydown-"));
  const markdownPath = join(dir, "app.md");
  const markdown = [
    '```text#field @keydown.prevent="record(event)"',
    "a",
    "```",
    "",
    "```text#status",
    "waiting",
    "```",
    "",
    "```js front",
    "export function record(event) {",
    "  const data = JSON.parse(JSON.stringify(event));",
    "  $('#status').val(`${data.key}:${data.target.id}:${data.target.value}:${data.defaultPrevented}:${Object.keys(event).includes('toJSON')}`);",
    "}",
    "```",
    "",
  ].join("\n");
  let output = "";
  let proc;
  let terminal;
  try {
    await writeFile(markdownPath, markdown);
    terminal = new Bun.Terminal({
      cols: 60,
      rows: 16,
      data(_terminal, data) {
        output += Buffer.from(data).toString();
      },
    });
    proc = Bun.spawn({
      cmd: [bunBin, tui, "+2:4", markdownPath],
      cwd: dir,
      terminal,
      env: { ...process.env, TERM: "xterm-256color", COLUMNS: "60", LINES: "16" },
    });
    await waitFor(() => Bun.stripANSI(output).includes("waiting"));
    terminal.write("x");
    await waitFor(() => Bun.stripANSI(output).includes("x:field:a:true:false"));
    terminal.write("\x11");
    await Promise.race([proc.exited, Bun.sleep(2000)]);
    expect(Bun.stripANSI(output)).toContain("x:field:a:true:false");
  } finally {
    if (proc && proc.exitCode == null) proc.kill();
    terminal?.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);

test("TUI keydown alert releases and restores terminal input", async () => {
  const dir = await mkdtemp(join(tmpdir(), "jsmdcui-keydown-alert-"));
  const markdownPath = join(dir, "app.md");
  const markdown = [
    '```text#field @keydown.prevent="celebrate(event)"',
    "focus here",
    "```",
    "",
    "```text#status",
    "waiting",
    "```",
    "",
    "```js front",
    "export function celebrate(event) {",
    "  if (event.key === 'x') {",
    "    alert('KEYDOWN ALERT');",
    "    $('#status').val('alert closed');",
    "    return;",
    "  }",
    "  $('#status').val(`second input: ${event.key}`);",
    "}",
    "```",
    "",
  ].join("\n");
  let output = "";
  let proc;
  let terminal;
  try {
    await writeFile(markdownPath, markdown);
    terminal = new Bun.Terminal({
      cols: 60,
      rows: 16,
      data(_terminal, data) {
        output += Buffer.from(data).toString();
      },
    });
    proc = Bun.spawn({
      cmd: [bunBin, tui, "+2:4", markdownPath],
      cwd: dir,
      terminal,
      env: { ...process.env, TERM: "xterm-256color", COLUMNS: "60", LINES: "16" },
    });
    await waitFor(() => Bun.stripANSI(output).includes("waiting"));
    terminal.write("x");
    await waitFor(() => Bun.stripANSI(output).includes("KEYDOWN ALERT"));
    terminal.write("\r");
    await waitFor(() => Bun.stripANSI(output).includes("alert closed"));
    terminal.write("z");
    await waitFor(() => Bun.stripANSI(output).includes("second input:z"));
    terminal.write("\x11");
    const exitCode = await Promise.race([
      proc.exited,
      Bun.sleep(2000).then(() => null),
    ]);
    expect(exitCode).toBe(0);
    expect(Bun.stripANSI(output)).toContain("second input:z");
  } finally {
    if (proc && proc.exitCode == null) proc.kill();
    terminal?.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);
