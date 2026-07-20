import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fenceEventMap, inlineFenceEventCode, parseFenceDeclarations } from "../src/cui/fence-events.mjs";
import { evalFront } from "../src/cui/rpc.mjs";
import { findTuiBlockAtLine } from "../src/plugins/js-bridge.js";
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
  expect(html).toContain('onkeydown="this.__mdcuiIdentifiedKeydown=!!event.key&amp;&amp;event.key!==&quot;Unidentified&quot;;');
  expect(html).toContain('if(event.key!==&quot;Unidentified&quot;){\nevent.preventDefault();guard(event)\n}"');
  expect(html).toContain('onbeforeinput="if(!this.__mdcuiIdentifiedKeydown&amp;&amp;event.data!=null');
  expect(html).toContain('Object.defineProperty(event,&quot;key&quot;,{configurable:true,value:String(event.data)});this.onkeydown(event)');
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

test("WUI beforeinput retries an unidentified keydown with InputEvent.data", () => {
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
  element.onkeydown = (event) => runKeydown.call(element, event, (current) => seen.push(current.key));

  const unidentified = {
    key: "Unidentified",
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  element.onkeydown(unidentified);
  expect(unidentified.defaultPrevented).toBeFalse();

  const beforeInput = {
    data: "a",
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
  };
  new Function("event", beforeInputCode).call(element, beforeInput);
  expect(seen).toEqual(["a"]);
  expect(beforeInput.key).toBe("a");
  expect(beforeInput.defaultPrevented).toBeTrue();
  clearTimeout(element.__mdcuiKeydownReset);
});

test("TUI finds the event target only while the cursor is inside the framed body", () => {
  const lines = ["┌─ text#myid.field", "│ value", "└─"];
  expect(findTuiBlockAtLine(lines, 0)).toBeNull();
  expect(findTuiBlockAtLine(lines, 1)?.header).toMatchObject({ tag: "text", id: "myid" });
  expect(findTuiBlockAtLine(lines, 2)).toBeNull();
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
    "  $('#status').val(`${event.key}:${event.target.value}:${event.defaultPrevented}`);",
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
    await waitFor(() => Bun.stripANSI(output).includes("x:a:true"));
    terminal.write("\x11");
    await Promise.race([proc.exited, Bun.sleep(2000)]);
    expect(Bun.stripANSI(output)).toContain("x:a:true");
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
    '```text#field @keydown.prevent="celebrate()"',
    "focus here",
    "```",
    "",
    "```text#status",
    "waiting",
    "```",
    "",
    "```js front",
    "export function celebrate() {",
    "  alert('KEYDOWN ALERT');",
    "  $('#status').val('input restored');",
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
    await waitFor(() => Bun.stripANSI(output).includes("input restored"));
    terminal.write("\x11");
    await Promise.race([proc.exited, Bun.sleep(2000)]);
    expect(Bun.stripANSI(output)).toContain("input restored");
  } finally {
    if (proc && proc.exitCode == null) proc.kill();
    terminal?.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 10000);
