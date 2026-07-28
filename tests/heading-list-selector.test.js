import { describe, expect, test } from "bun:test";
import { createWebDollar } from "../src/cui/rpc.mjs";
import {
  captureTuiRerenderState,
  clearTuiSourceDependentState,
  createTuiSelector,
  restoreTuiRerenderState,
  spliceTuiBufferLines,
  toggleTuiHeadingAt,
} from "../src/plugins/js-bridge.js";

function tuiSelector(markdown) {
  const ansi = String(Bun.markdown.ansi(markdown, { hyperlinks: true, columns: 80 }));
  const buffer = {
    lines: Bun.stripANSI(ansi).split("\n"),
    _mdcuiTuiSourceText: markdown,
    _mdcuiAnsiText: ansi,
    cursor: { x: 0, y: 0 },
    ensureCursor() {},
    invalidateHighlightFrom() {},
  };
  return { $: createTuiSelector(() => buffer), buffer };
}

const markdown = `## Features

- [x] Search
- [ ] Notifications
  - [x] Nested notification option
- [x] Offline

Paragraph between lists.

- [x] Later list item

## Next
`;

describe("TUI heading task-list Array methods", () => {
  test("push and unshift accept multiple items and return the new direct length", () => {
    const { $ } = tuiSelector(markdown);
    const features = $("#features");

    expect(features.push("Export", { value: "Sync", checked: true })).toBe(5);
    expect(features.val()).toEqual(["Search", "Offline", "Sync"]);
    expect(features.unshift("First", { label: "Pinned", checked: true })).toBe(7);
    expect(features.val()).toEqual(["Pinned", "Search", "Offline", "Sync"]);
  });

  test("pop and shift return removed labels and remove nested children with the parent", () => {
    const { $, buffer } = tuiSelector(markdown);
    const features = $("#features");

    expect(features.shift()).toBe("Search");
    expect(buffer.lines.some((line) => line.includes("Search"))).toBe(false);
    expect(features.shift()).toBe("Notifications");
    expect(buffer.lines.some((line) => line.includes("Nested notification option"))).toBe(false);
    expect(features.pop()).toBe("Offline");
    expect(features.pop()).toBeUndefined();
  });

  test("an emptied list keeps its insertion point for later pushes", () => {
    const { $ } = tuiSelector("## Features\n\n- [ ] Only\n\n## Next\n");
    const features = $("#features");

    expect(features.pop()).toBe("Only");
    expect(features.pop()).toBeUndefined();
    expect(features.push({ value: "Again", checked: true })).toBe(1);
    expect(features.val()).toEqual(["Again"]);
  });

  test("val and mutations stop at the first rendered task list", () => {
    const { $ } = tuiSelector(markdown);
    const features = $("#features");

    expect(features.val()).toEqual(["Search", "Offline"]);
    expect(features.pop()).toBe("Offline");
    expect(features.val()).toEqual(["Search"]);
  });

  test("a loose task list remains one list across indented item content", () => {
    const { $ } = tuiSelector(`## Features

- [x] First

  More detail

- [x] Second

Paragraph after the list.

- [x] Later list
`);
    const features = $("#features");

    expect(features.val()).toEqual(["First", "Second"]);
    expect(features.pop()).toBe("Second");
    expect(features.pop()).toBe("First");
    expect(features.pop()).toBeUndefined();
  });

  test("splice follows Array indexing, insertion, deletion, and return semantics", () => {
    const { $, buffer } = tuiSelector(markdown);
    const features = $("#features");

    expect(features.splice()).toEqual([]);
    expect(features.splice(1, 1, { value: "Replacement", checked: true }, "Extra"))
      .toEqual(["Notifications"]);
    expect(buffer.lines.some((line) => line.includes("Nested notification option"))).toBe(false);
    expect(features.val()).toEqual(["Search", "Replacement", "Offline"]);
    expect(features.splice(-1)).toEqual(["Offline"]);
    expect(features.splice(1, undefined, "Inserted")).toEqual([]);
    expect(features.splice(0, Infinity)).toEqual(["Search", "Inserted", "Replacement", "Extra"]);
    expect(features.val()).toEqual([]);
    expect(features.splice(0, 0, { label: "Again", checked: true })).toEqual([]);
    expect(features.val()).toEqual(["Again"]);
  });

  test("slice returns read-only item snapshots with checked state", () => {
    const { $ } = tuiSelector(markdown);
    const features = $("#features");

    const result = features.slice(0, 2);
    expect(result).toEqual([
      { value: "Search", checked: true },
      { value: "Notifications", checked: false },
    ]);
    result[0].value = "Changed snapshot";
    result[0].checked = false;
    expect(features.slice(-1)).toEqual([{ value: "Offline", checked: true }]);
    expect(features.val()).toEqual(["Search", "Offline"]);
  });

  test("a heading without a task list cannot create one implicitly", () => {
    const { $, buffer } = tuiSelector("## Empty\n\nParagraph.\n");
    expect($("#empty").push("No target")).toBe(0);
    expect($("#empty").unshift("No target")).toBe(0);
    expect($("#empty").pop()).toBeUndefined();
    expect($("#empty").shift()).toBeUndefined();
    expect(buffer._mdcuiMutationMacros).toBeUndefined();
  });

  test("mutations against a hidden heading fail without recording a macro", () => {
    const { $, buffer } = tuiSelector(markdown);
    const features = $("#features");

    features.hide();
    expect(features.push("Hidden addition")).toBe(0);
    expect(features.pop()).toBeUndefined();
    expect(features.shift()).toBeUndefined();
    expect(features.unshift("Hidden first")).toBe(0);
    expect(features.splice(0, 1, "Hidden replacement")).toEqual([]);
    expect(buffer._mdcuiMutationMacros).toBeUndefined();

    features.show();
    expect(buffer.lines.some((line) => line.includes("Hidden addition"))).toBe(false);
    expect(features.val()).toEqual(["Search", "Offline"]);
  });

  test("a preceding hidden section does not extend a later heading into its child list", () => {
    const source = `## Earlier

### Earlier child

Earlier body.

## Parent

Parent has no list.

### Child

- [x] Child checkbox
`;
    const { $, buffer } = tuiSelector(source);

    $("#earlier").hide();
    expect($("#parent").val()).toEqual([]);
    expect($("#parent").slice()).toEqual([]);
    expect($("#parent").push("Must not reach child")).toBe(0);
    expect(buffer._mdcuiMutationMacros).toBeUndefined();
    expect($("#child").val()).toEqual(["Child checkbox"]);
    expect(buffer.lines.some((line) => line.includes("Must not reach child"))).toBe(false);
  });

  test("a heading concealed by its parent cannot resolve to an earlier same-level heading", () => {
    const source = `## Wrong

- [x] Wrong item

# Parent

## Hidden

- [x] Hidden item

## Also hidden

Body.

# End
`;
    const { $, buffer } = tuiSelector(source);
    const hidden = $("#hidden");

    $("#parent").hide();
    expect(hidden.line()).toBe(0);
    expect(hidden.text()).toBe("");
    expect(hidden.val()).toEqual([]);
    expect(hidden.slice()).toEqual([]);
    expect(hidden.push("Must not reach Wrong")).toBe(0);
    expect(hidden.pop()).toBeUndefined();
    expect(hidden.shift()).toBeUndefined();
    expect(hidden.unshift("Must not reach Wrong first")).toBe(0);
    expect(hidden.splice(0, 1, "Must not replace Wrong")).toEqual([]);
    expect($("#wrong").slice()).toEqual([{ value: "Wrong item", checked: true }]);
    expect(buffer._mdcuiMutationMacros).toBeUndefined();
    expect(buffer.lines.some((line) => line.includes("Must not"))).toBe(false);
  });
});

describe("TUI heading section visibility", () => {
  const sectionMarkdown = `# First

First body.

## Child

Child body.

### Grandchild

Grandchild body.

## Sibling

Sibling body.

# Second

Second body.
`;

  test("hide keeps the heading and hides through the next equal or higher heading", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);
    const child = $("#child");

    expect(child.hide()).toBe(child);
    expect(buffer.lines.some(line => line.includes("Child"))).toBe(true);
    expect(buffer.lines.some(line => line.includes("Child body."))).toBe(false);
    expect(buffer.lines.some(line => line.includes("Grandchild"))).toBe(false);
    expect(buffer.lines.some(line => line.includes("Sibling body."))).toBe(true);
    expect(buffer.lines.some(line => line.includes("Second body."))).toBe(true);
  });

  test("show restores the section and toggle switches the id-centered state", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);
    const child = $("#child");

    child.hide();
    child.show();
    expect(buffer.lines.some(line => line.includes("Child body."))).toBe(true);
    expect(buffer.lines.some(line => line.includes("Grandchild body."))).toBe(true);

    child.toggle();
    expect(buffer.lines.some(line => line.includes("Child body."))).toBe(false);
    child.toggle();
    expect(buffer.lines.some(line => line.includes("Child body."))).toBe(true);
  });

  test("show, hide, and toggle update a child while its parent is hidden", () => {
    const scenarios = [
      { initiallyHidden: false, method: "hide", visible: false },
      { initiallyHidden: true, method: "show", visible: true },
      { initiallyHidden: false, method: "toggle", visible: false },
      { initiallyHidden: true, method: "toggle", visible: true },
    ];

    for (const scenario of scenarios) {
      const { $, buffer } = tuiSelector(sectionMarkdown);
      const first = $("#first");
      const child = $("#child");
      if (scenario.initiallyHidden) child.hide();
      first.hide();

      child[scenario.method]();

      expect(buffer._mdcuiIdStore.get("first").headingVisibility.hidden).toBe(true);
      expect(buffer.lines.some(line => line.includes("First body."))).toBe(false);
      first.show();
      expect(buffer.lines.some(line => line.includes("Child body.")))
        .toBe(scenario.visible);
      expect(Boolean(buffer._mdcuiIdStore.get("child")?.headingVisibility?.hidden))
        .toBe(!scenario.visible);
    }
  });

  test("a deep toggle crosses multiple hidden ancestors without exposing them", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);
    const first = $("#first");
    const child = $("#child");
    const grandchild = $("#grandchild");

    $("#second").hide();
    child.hide();
    first.hide();
    buffer.cursor = { x: 0, y: buffer.lines.length - 1 };
    buffer.modified = false;
    const cursor = { ...buffer.cursor };

    grandchild.toggle();

    expect(buffer.cursor).toEqual(cursor);
    expect(buffer.modified).toBe(false);
    expect(buffer._mdcuiIdStore.get("first").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("child").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("grandchild").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("second").headingVisibility.hidden).toBe(true);

    first.show();
    child.show();
    expect(buffer.lines.some(line => line.includes("Grandchild"))).toBe(true);
    expect(buffer.lines.some(line => line.includes("Grandchild body."))).toBe(false);
    grandchild.show();
    expect(buffer.lines.some(line => line.includes("Grandchild body."))).toBe(true);
  });

  test("visibility changes do not mark the read-only rendered buffer modified", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);
    buffer.modified = false;

    $("#first").hide();
    expect(buffer.modified).toBe(false);
    expect(buffer._mdcuiIdStore.get("first").headingVisibility.hidden).toBe(true);
    $("#first").show();
    expect(buffer.modified).toBe(false);
    expect(buffer._mdcuiIdStore.has("first")).toBe(false);
  });

  test("heading visibility shares a general id record without replacing other state", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);
    const shared = { customState: { count: 1 } };
    buffer._mdcuiIdStore = new Map([["child", shared]]);

    $("#child").hide();
    expect(buffer._mdcuiIdStore.get("child").customState).toEqual({ count: 1 });
    expect(buffer._mdcuiIdStore.get("child").headingVisibility.hidden).toBe(true);
    $("#child").show();
    expect(buffer._mdcuiIdStore.get("child")).toBe(shared);
    expect(buffer._mdcuiIdStore.get("child").headingVisibility).toBeUndefined();
  });

  test("a collapsed earlier section does not break a later heading reference", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);

    $("#child").hide();
    $("#sibling").hide();
    expect(buffer.lines.some(line => line.includes("Sibling"))).toBe(true);
    expect(buffer.lines.some(line => line.includes("Sibling body."))).toBe(false);

    $("#sibling").show();
    expect(buffer.lines.some(line => line.includes("Sibling body."))).toBe(true);
    expect(buffer.lines.some(line => line.includes("Grandchild body."))).toBe(false);
  });

  test("show resolves the heading again after preceding text changes the line count", () => {
    const { $, buffer } = tuiSelector(sectionMarkdown);
    const sibling = $("#sibling");

    sibling.hide();
    spliceTuiBufferLines(buffer, 0, 0, ["Inserted one", "Inserted two"], {
      ansi: ["Inserted one", "Inserted two"],
    });
    sibling.show();

    const headingIndex = buffer.lines.findIndex(line => line.includes("Sibling"));
    expect(headingIndex).toBeGreaterThan(1);
    expect(buffer.lines.slice(headingIndex + 1).some(line => line.includes("Sibling body."))).toBe(true);
  });

  test("the heading's first character is a fixed toggle target", () => {
    const { buffer } = tuiSelector(sectionMarkdown);
    const headingRow = buffer.lines.findIndex(line => line.includes("Child"));
    const firstCharacter = buffer.lines[headingRow].search(/\S/);

    expect(toggleTuiHeadingAt(buffer, headingRow, firstCharacter + 1)).toBe(false);
    expect(toggleTuiHeadingAt(buffer, headingRow, firstCharacter)).toBe(true);
    expect(buffer.lines.some(line => line.includes("Child body."))).toBe(false);
    expect(toggleTuiHeadingAt(buffer, headingRow, firstCharacter)).toBe(true);
    expect(buffer.lines.some(line => line.includes("Child body."))).toBe(true);
  });
});

describe("TUI id-centered user data", () => {
  test("data returns the same object stored under the selector id", () => {
    const { $, buffer } = tuiSelector("## Features\n\nBody.\n");
    const features = $("#features");
    const data = features.data();

    data.count = 1;
    expect(features.data()).toBe(data);
    expect(buffer._mdcuiIdStore.get("features").data).toBe(data);
    expect(features.data("count")).toBe(1);
  });

  test("data setters and removeData preserve other id state", () => {
    const { $, buffer } = tuiSelector("## Features\n\nBody.\n");
    const features = $("#features");

    features.data("model", { ready: true }).data({ count: 2, label: "x" });
    features.hide();
    features.removeData("count label");
    expect(features.data("model")).toEqual({ ready: true });
    features.removeData();
    expect(buffer._mdcuiIdStore.get("features").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("features").data).toBeUndefined();
  });

  test("legal object ids discard the object and retain identity through arbitrary nesting", () => {
    const { $, buffer } = tuiSelector("## Features\n\n- [x] Search\n");
    const features = $("#features");
    const objectTarget = {
      id: "features",
      innerHTML: "DECOY HTML",
      textContent: "DECOY TEXT",
      value: "DECOY VALUE",
    };
    const direct = $(objectTarget);
    expect(direct.text()).toBe("Features");
    expect(direct.val()).toEqual(["Search"]);
    objectTarget.id = "missing";
    let nested = direct;
    for (let depth = 0; depth < 8; depth++) nested = $(nested);

    expect(features.id).toBe("features");
    expect(nested.id).toBe("features");
    expect(nested.html()).toBe("Features");
    expect(nested.text()).toBe("Features");
    expect(nested.val()).toEqual(["Search"]);
    expect(nested.text("Ignored")).toBe(nested);
    expect(nested.val("Ignored")).toBe(nested);
    expect(objectTarget).toEqual({
      id: "missing",
      innerHTML: "DECOY HTML",
      textContent: "DECOY TEXT",
      value: "DECOY VALUE",
    });
    features.data("count", 1);
    expect($({ id: "features" }).data("count")).toBe(1);
    expect(nested.data()).toBe(features.data());
    expect(nested.push("Nested addition")).toBe(2);
    expect(buffer._mdcuiMutationMacros.at(-1).selector).toBe("#features");
    nested.hide();
    expect(buffer._mdcuiIdStore.get("features").headingVisibility.hidden).toBe(true);
  });
});

describe("TUI source-dependent state reset", () => {
  test("reopen cache clearing drops old render state while preserving user data", () => {
    const oldSource = `# Topic

OLD BODY

- [ ] Original

# End
`;
    const { $, buffer } = tuiSelector(oldSource);
    const topic = $("#topic");
    const data = topic.data();
    data.count = 1;
    topic.push("Old runtime item");
    topic.hide();
    const record = buffer._mdcuiIdStore.get("topic");
    record.customState = { keep: true };
    buffer._mdcuiRerenderMismatch = { checkboxes: { before: 2, after: 1 } };
    buffer._mdcuiFenceBlockIndex = [{ stale: true }];
    buffer._mdcuiControlBlockIndex = [{ stale: true }];

    const newSource = `# Topic

NEW BODY

- [ ] Fresh

# End
`;
    const newAnsi = String(Bun.markdown.ansi(
      newSource,
      { hyperlinks: true, columns: 80 },
    ));
    buffer.lines = Bun.stripANSI(newAnsi).split("\n");
    buffer._mdcuiTuiSourceText = newSource;
    buffer._mdcuiAnsiText = newAnsi;
    clearTuiSourceDependentState(buffer);

    expect(buffer._mdcuiIdStore.get("topic")).toBe(record);
    expect(topic.data()).toBe(data);
    expect(topic.data("count")).toBe(1);
    expect(record.customState).toEqual({ keep: true });
    expect(record.headingVisibility).toBeUndefined();
    expect(buffer._mdcuiMutationMacros).toBeUndefined();
    expect(buffer._mdcuiReplayingMutations).toBe(false);
    expect(buffer._mdcuiHeadingTaskListAnchors).toBeNull();
    expect(buffer._mdcuiRerenderMismatch).toBeNull();
    expect(buffer._mdcuiFenceBlockIndex).toBeNull();
    expect(buffer._mdcuiControlBlockIndex).toBeNull();

    topic.show();
    expect(buffer.lines.some(line => line.includes("OLD BODY"))).toBe(false);
    expect(buffer.lines.some(line => line.includes("Old runtime item"))).toBe(false);
    expect(buffer.lines.some(line => line.includes("Original"))).toBe(false);
    expect(buffer.lines.filter(line => line.includes("NEW BODY"))).toHaveLength(1);
    expect(topic.slice()).toEqual([{ value: "Fresh", checked: false }]);
  });

  test("cache clearing prunes id records that contain only visibility state", () => {
    const buffer = {
      _mdcuiIdStore: new Map([
        ["only-visibility", {
          headingVisibility: {
            hidden: true,
            ordinal: 0,
            headingCount: 0,
            segment: { lines: [], images: [] },
          },
        }],
      ]),
    };

    clearTuiSourceDependentState(buffer);

    expect(buffer._mdcuiIdStore.has("only-visibility")).toBe(false);
  });
});

describe("TUI object target wrapper", () => {
  test("text gets and sets textContent for synthetic event targets", () => {
    const { $ } = tuiSelector("Body.\n");
    const target = { textContent: "Save" };
    const wrapped = $(target);

    expect(wrapped.text()).toBe("Save");
    expect(wrapped.text("Saved")).toBe(wrapped);
    expect(target.textContent).toBe("Saved");
  });

  test("val uses value when present and otherwise falls back to textContent", () => {
    const { $ } = tuiSelector("Body.\n");
    const input = { value: "old", textContent: "label" };
    const link = { textContent: "Open" };

    expect($(input).val()).toBe("old");
    $(input).val("new");
    expect(input.value).toBe("new");
    expect(input.textContent).toBe("label");
    expect($(link).val()).toBe("Open");
    $(link).val("Close");
    expect(link.textContent).toBe("Close");
  });

  test("html reads generic innerHTML and val stringifies object values", () => {
    const { $ } = tuiSelector("Body.\n");

    expect($({ innerHTML: "<b>Body</b>" }).html()).toBe("<b>Body</b>");
    expect($({ value: 123 }).val()).toBe("123");
  });

  test("invalid object ids stay generic while missing legal ids do not", () => {
    const { $ } = tuiSelector("## Features\n\nBody.\n");
    const invalidTargets = [
      { id: "9invalid", value: "numeric" },
      { id: "invalid id", value: "spaced" },
    ];
    const missing = { id: "missing", value: "decoy", textContent: "decoy" };

    for (const target of invalidTargets) {
      const wrapped = $(target);
      expect(wrapped.id).toBe("");
      expect(wrapped.val()).toBe(target.value);
      wrapped.val("updated");
      expect(target.value).toBe("updated");
    }
    expect($(missing).val()).toBe("");
    $(missing).val("ignored");
    expect(missing.value).toBe("decoy");
    expect(missing.textContent).toBe("decoy");
  });
});

describe("TUI heading text getter", () => {
  test("returns the rendered heading text without enabling a string-selector setter", () => {
    const { $, buffer } = tuiSelector("## Hello *world* & `<tag>`\n\nBody.\n");
    const heading = $("#hello-world-tag");

    expect(heading.text()).toBe("Hello world & <tag>");
    expect(heading.text("Replacement")).toBe(heading);
    expect(heading.text()).toBe("Hello world & <tag>");
    expect(buffer.lines.some((line) => line.includes("Replacement"))).toBe(false);
  });

  test("remains available while the heading section is hidden", () => {
    const { $ } = tuiSelector("## Hidden title\n\nBody.\n");
    const heading = $("#hidden-title");

    heading.hide();
    expect(heading.text()).toBe("Hidden title");
  });
});

describe("TUI resize state restoration", () => {
  test("replays a mutation recorded through arbitrarily nested id selections", () => {
    const source = "## Features\n\n- [ ] Original\n";
    const { $, buffer } = tuiSelector(source);
    const objectTarget = { id: "features", value: "DECOY" };
    let nested = $(objectTarget);
    for (let depth = 0; depth < 8; depth++) nested = $(nested);

    expect(nested.push({ value: "Added through nesting", checked: true })).toBe(2);
    expect(buffer._mdcuiMutationMacros).toHaveLength(1);
    expect(buffer._mdcuiMutationMacros[0].selector).toBe("#features");

    const snapshot = captureTuiRerenderState(buffer);
    const narrowAnsi = String(Bun.markdown.ansi(
      source,
      { hyperlinks: true, columns: 24 },
    ));
    buffer.lines = Bun.stripANSI(narrowAnsi).split("\n");
    buffer._mdcuiAnsiText = narrowAnsi;
    buffer._ansiStyleLines = null;
    buffer._mdcuiHeadingTaskListAnchors = null;
    restoreTuiRerenderState(buffer, snapshot);

    const items = nested.slice();
    expect(items).toEqual([
      { value: "Original", checked: false },
      { value: "Added through nesting", checked: true },
    ]);
    expect(items.filter(item => item.value === "Added through nesting"))
      .toHaveLength(1);
    expect(buffer._mdcuiRerenderMismatch).toBeNull();
    expect(objectTarget.value).toBe("DECOY");
  });

  test("preserves a deep visibility change made through hidden ancestors", () => {
    const source = `# First

First body.

## Child

Child body.

### Grandchild

Grandchild body.

# End
`;
    const { $, buffer } = tuiSelector(source);
    $("#grandchild").hide();
    $("#child").hide();
    $("#first").hide();
    $("#grandchild").show();

    const snapshot = captureTuiRerenderState(buffer);
    const narrowAnsi = String(Bun.markdown.ansi(
      source,
      { hyperlinks: true, columns: 24 },
    ));
    buffer.lines = Bun.stripANSI(narrowAnsi).split("\n");
    buffer._mdcuiAnsiText = narrowAnsi;
    buffer._ansiStyleLines = null;
    buffer._mdcuiHeadingTaskListAnchors = null;
    restoreTuiRerenderState(buffer, snapshot);

    expect(buffer._mdcuiIdStore.get("first").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("child").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("grandchild")?.headingVisibility).toBeUndefined();
    $("#first").show();
    $("#child").show();
    expect(buffer.lines.some(line => line.includes("Grandchild body."))).toBe(true);
    expect(buffer._mdcuiRerenderMismatch).toBeNull();
  });

  test("replays list macros, restores checkbox order, and re-hides deepest headings first", () => {
    const source = `# Parent

- [ ] A checkbox label long enough to wrap after resizing

## Child

- [ ] Child checkbox

### Deep

- [ ] Deep checkbox

# End
`;
    const { $, buffer } = tuiSelector(source);
    $("#parent").push({ value: "Added by macro", checked: false });
    for (const needle of ["Child checkbox", "Deep checkbox"]) {
      const y = buffer.lines.findIndex((line) => line.includes(needle));
      buffer.lines[y] = buffer.lines[y].replace("☐", "☒");
    }
    $("#deep").hide();
    $("#parent").hide();

    const snapshot = captureTuiRerenderState(buffer);
    const narrowAnsi = String(Bun.markdown.ansi(source, { hyperlinks: true, columns: 24 }));
    buffer.lines = Bun.stripANSI(narrowAnsi).split("\n");
    buffer._mdcuiAnsiText = narrowAnsi;
    buffer._ansiStyleLines = null;
    buffer._mdcuiHeadingTaskListAnchors = null;
    restoreTuiRerenderState(buffer, snapshot);

    expect(buffer._mdcuiIdStore.get("parent").headingVisibility.hidden).toBe(true);
    expect(buffer._mdcuiIdStore.get("deep").headingVisibility.hidden).toBe(true);
    $("#parent").show();
    expect(buffer.lines.some((line) => line.includes("Added by macro"))).toBe(true);
    expect(buffer.lines.some((line) => line.includes("Child checkbox") && line.includes("☒"))).toBe(true);
    $("#deep").show();
    expect(buffer.lines.some((line) => line.includes("Deep checkbox") && line.includes("☒"))).toBe(true);
    expect(buffer._mdcuiRerenderMismatch).toBeNull();
  });

  test("restores direct fence body edits by block order and identity", () => {
    const source = "```text#editor\noriginal\n```\n";
    const buffer = {
      lines: source.split("\n"),
      _mdcuiTuiSourceText: source,
      _mdcuiAnsiText: source,
      cursor: { x: 0, y: 0 },
      ensureCursor() {},
      invalidateHighlightFrom() {},
    };
    buffer.lines[1] = "user input";
    buffer._mdcuiAnsiText = buffer.lines.join("\n");
    const snapshot = captureTuiRerenderState(buffer);

    buffer.lines = source.split("\n");
    buffer._mdcuiAnsiText = source;
    restoreTuiRerenderState(buffer, snapshot);

    expect(buffer.lines[1]).toBe("user input");
    expect(buffer._mdcuiRerenderMismatch).toBeNull();
  });
});

class TestText {
  constructor(text, ownerDocument) {
    this.textContent = String(text);
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
  }
}

class TestElement {
  constructor(tagName, ownerDocument) {
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentElement = null;
    this.childNodes = [];
    this.classList = new Set();
    this.id = "";
  }

  get children() {
    return this.childNodes.filter((node) => node instanceof TestElement);
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get nextElementSibling() {
    const siblings = this.parentElement?.children ?? [];
    const index = siblings.indexOf(this);
    return index >= 0 ? siblings[index + 1] ?? null : null;
  }

  get textContent() {
    return this.childNodes.map((node) => node.textContent).join("");
  }

  set textContent(value) {
    this.childNodes = [];
    this.append(this.ownerDocument.createTextNode(value));
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.childNodes.push(node);
    }
  }

  insertBefore(node, before) {
    node.parentElement = this;
    const index = before == null ? -1 : this.childNodes.indexOf(before);
    if (index < 0) this.childNodes.push(node);
    else this.childNodes.splice(index, 0, node);
  }

  remove() {
    const siblings = this.parentElement?.childNodes;
    const index = siblings?.indexOf(this) ?? -1;
    if (index >= 0) siblings.splice(index, 1);
    this.parentElement = null;
  }

  matches(selector) {
    if (selector === "ul, ol") return this.tagName === "UL" || this.tagName === "OL";
    if (selector === "li.task-list-item")
      return this.tagName === "LI" && this.classList.has("task-list-item");
    return false;
  }

  closest(selector) {
    for (let node = this; node; node = node.parentElement) {
      if (selector === "label" && node.tagName === "LABEL") return node;
      if (selector === "li.task-list-item" && node.matches(selector)) return node;
    }
    return null;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const matches = [];
    const visit = (node) => {
      for (const child of node.children) {
        if (selector === 'input[type="checkbox"]' &&
            child.tagName === "INPUT" && child.type === "checkbox") matches.push(child);
        else if (selector === "ul, ol" && child.matches(selector)) matches.push(child);
        else if (selector === "li.task-list-item" && child.matches(selector)) matches.push(child);
        visit(child);
      }
    };
    visit(this);
    return matches;
  }
}

class TestDocument {
  constructor() {
    this.root = new TestElement("main", this);
  }

  createElement(tagName) {
    return new TestElement(tagName, this);
  }

  createTextNode(text) {
    return new TestText(text, this);
  }

  getElementById(id) {
    return this.querySelectorAll("heading").find((element) => element.id === id) ?? null;
  }

  querySelector(selector) {
    if (!selector.startsWith("#")) return null;
    const id = selector.slice(1);
    return this.querySelectorAll("heading").find((element) => element.id === id) ?? null;
  }

  querySelectorAll(selector) {
    if (selector === "[data-mdcui-tag]" || selector === "pre > code") return [];
    if (selector === "heading") {
      const headings = [];
      const visit = (node) => {
        for (const child of node.children) {
          if (/^H[1-6]$/.test(child.tagName)) headings.push(child);
          visit(child);
        }
      };
      visit(this.root);
      return headings;
    }
    return [];
  }
}

function appendWebItem(documentObject, list, value, checked = false) {
  const item = documentObject.createElement("li");
  item.classList.add("task-list-item");
  const label = documentObject.createElement("label");
  const checkbox = documentObject.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  label.append(checkbox, documentObject.createTextNode(value));
  item.append(label);
  list.append(item);
  return item;
}

function webSelector() {
  const documentObject = new TestDocument();
  const section = documentObject.createElement("section");
  const heading = documentObject.createElement("h2");
  heading.id = "features";
  heading.append(documentObject.createTextNode("Features"));
  const list = documentObject.createElement("ul");
  appendWebItem(documentObject, list, "Search", true);
  appendWebItem(documentObject, list, "Notifications");
  appendWebItem(documentObject, list, "Offline", true);
  section.append(heading, list);
  documentObject.root.append(section);
  return { $: createWebDollar(documentObject), documentObject, section, heading, list };
}

function nestedWebSelector() {
  const documentObject = new TestDocument();
  const outerSection = documentObject.createElement("section");
  const outerHeading = documentObject.createElement("h1");
  outerHeading.id = "first";
  outerHeading.append(documentObject.createTextNode("First"));
  const outerBody = documentObject.createElement("p");
  outerBody.append(documentObject.createTextNode("First web body."));
  const childSection = documentObject.createElement("section");
  const childHeading = documentObject.createElement("h2");
  childHeading.id = "child";
  childHeading.append(documentObject.createTextNode("Child"));
  const childBody = documentObject.createElement("p");
  childBody.append(documentObject.createTextNode("Child web body."));
  childSection.append(childHeading, childBody);
  outerSection.append(outerHeading, outerBody, childSection);
  documentObject.root.append(outerSection);
  return {
    $: createWebDollar(documentObject),
    documentObject,
    outerSection,
    outerHeading,
    childSection,
    childHeading,
    childBody,
  };
}

describe("WUI heading task-list Array methods", () => {
  test("uses the first list and follows Array return values", () => {
    const { $ } = webSelector();
    const features = $("#features");

    expect(features.push("Export", { value: "Sync", checked: true })).toBe(5);
    expect(features.val()).toEqual(["Search", "Offline", "Sync"]);
    expect(features.unshift("First", "Second")).toBe(7);
    expect(features.shift()).toBe("First");
    expect(features.pop()).toBe("Sync");
    expect(features.val()).toEqual(["Search", "Offline"]);
  });

  test("an empty first list remains the target", () => {
    const { $, list } = webSelector();
    const features = $("#features");

    expect(features.shift()).toBe("Search");
    expect(features.shift()).toBe("Notifications");
    expect(features.shift()).toBe("Offline");
    expect(features.shift()).toBeUndefined();
    expect(features.val()).toEqual([]);
    expect(features.push({ label: "Again", checked: true })).toBe(1);
    expect(list.children).toHaveLength(1);
    expect(features.val()).toEqual(["Again"]);
  });

  test("splice follows Array indexing and returns removed labels", () => {
    const { $ } = webSelector();
    const features = $("#features");

    expect(features.splice()).toEqual([]);
    expect(features.splice(1, 1, { value: "Replacement", checked: true }, "Extra"))
      .toEqual(["Notifications"]);
    expect(features.val()).toEqual(["Search", "Replacement", "Offline"]);
    expect(features.splice(-1)).toEqual(["Offline"]);
    expect(features.splice(0, Infinity)).toEqual(["Search", "Replacement", "Extra"]);
    expect(features.splice(0, 0, { value: "Again", checked: true })).toEqual([]);
    expect(features.val()).toEqual(["Again"]);
  });

  test("slice returns read-only item snapshots with checked state", () => {
    const { $ } = webSelector();
    const features = $("#features");

    const result = features.slice(0, 2);
    expect(result).toEqual([
      { value: "Search", checked: true },
      { value: "Notifications", checked: false },
    ]);
    result[0].value = "Changed snapshot";
    result[0].checked = false;
    expect(features.slice(-1)).toEqual([{ value: "Offline", checked: true }]);
    expect(features.val()).toEqual(["Search", "Offline"]);
  });
});

describe("WUI heading section visibility", () => {
  test("hide promotes the heading and hides its section", () => {
    const { $, documentObject, section, heading } = webSelector();
    const features = $("#features");

    expect(features.hide()).toBe(features);
    expect(documentObject.root.children).toEqual([heading, section]);
    expect(heading.parentElement).toBe(documentObject.root);
    expect(section.hidden).toBe(true);
    expect(documentObject._mdcuiIdStore.get("features").headingVisibility.section).toBe(section);
  });

  test("show restores the heading as the section's first item", () => {
    const { $, documentObject, section, heading, list } = webSelector();
    const features = $("#features");

    features.hide().show();
    expect(documentObject.root.children).toEqual([section]);
    expect(section.children).toEqual([heading, list]);
    expect(section.firstChild).toBe(heading);
    expect(section.hidden).toBe(false);
    expect(documentObject._mdcuiIdStore.has("features")).toBe(false);
  });

  test("toggle switches between the promoted and restored states", () => {
    const { $, section, heading } = webSelector();
    const features = $("#features");

    features.toggle();
    expect(section.hidden).toBe(true);
    expect(heading.parentElement).not.toBe(section);
    features.toggle();
    expect(section.hidden).toBe(false);
    expect(heading.parentElement).toBe(section);
  });

  test("show, hide, and toggle update a child while its parent is hidden", () => {
    const scenarios = [
      { initiallyHidden: false, method: "hide", visible: false },
      { initiallyHidden: true, method: "show", visible: true },
      { initiallyHidden: false, method: "toggle", visible: false },
      { initiallyHidden: true, method: "toggle", visible: true },
    ];

    for (const scenario of scenarios) {
      const {
        $, documentObject, outerSection, childSection, childHeading,
      } = nestedWebSelector();
      const first = $("#first");
      const child = $("#child");
      if (scenario.initiallyHidden) child.hide();
      first.hide();

      child[scenario.method]();

      expect(outerSection.hidden).toBe(true);
      expect(documentObject._mdcuiIdStore.get("first").headingVisibility.hidden)
        .toBe(true);
      first.show();
      expect(Boolean(childSection.hidden)).toBe(!scenario.visible);
      expect(Boolean(
        documentObject._mdcuiIdStore.get("child")?.headingVisibility?.hidden,
      )).toBe(!scenario.visible);
      expect(childHeading.parentElement === childSection).toBe(scenario.visible);
    }
  });
});

describe("WUI id-centered user data", () => {
  test("document store and DOM expose the exact same data object", () => {
    const { $, documentObject, heading } = webSelector();
    const features = $("#features");
    const data = features.data();

    data.count = 1;
    expect(features.data()).toBe(data);
    expect(documentObject._mdcuiIdStore.get("features").data).toBe(data);
    expect(heading.mdcuiData).toBe(data);
    expect(features.data("count")).toBe(1);
  });

  test("document data survives DOM removal and reattaches to a replacement", () => {
    const { $, documentObject, heading } = webSelector();
    const features = $("#features");
    const model = { ready: true };
    features.data("model", model);

    heading.remove();
    expect(features.data("model")).toBe(model);

    const replacement = documentObject.createElement("h2");
    replacement.id = "features";
    documentObject.root.append(replacement);
    expect(features.data()).toBe(documentObject._mdcuiIdStore.get("features").data);
    expect(replacement.mdcuiData).toBe(features.data());
  });

  test("removeData supports keys and keeps framework visibility state", () => {
    const { $, documentObject, heading } = webSelector();
    const features = $("#features");

    features.data({ count: 1, label: "x" }).hide();
    features.removeData(["count", "label"]);
    expect(features.data()).toEqual({});
    features.data("temporary", true).removeData();
    expect(heading.mdcuiData).toBeUndefined();
    expect(documentObject._mdcuiIdStore.get("features").headingVisibility.hidden).toBe(true);
  });

  test("selection ids allow a selection to be wrapped again", () => {
    const { $, documentObject, heading } = webSelector();
    const features = $("#features");
    const nested = $($($(features)));

    expect(features.id).toBe("features");
    expect(nested.id).toBe("features");
    features.data("count", 1);
    expect(nested.data()).toBe(features.data());
    expect(nested.text()).toBe(heading.textContent);
    nested.hide();
    expect(documentObject._mdcuiIdStore.get("features").headingVisibility.hidden).toBe(true);
  });

  test("plain id objects resolve headings and nested data survives DOM removal", () => {
    const { $, documentObject, heading } = webSelector();
    const byId = $({ id: "features" });
    const nested = $($($("#features")));

    expect(byId.text()).toBe(heading.textContent);
    byId.data("count", 2);
    expect($("#features").data("count")).toBe(2);
    byId.hide();
    expect(documentObject._mdcuiIdStore.get("features").headingVisibility.hidden).toBe(true);
    byId.show();
    expect(documentObject._mdcuiIdStore.get("features").headingVisibility).toBeUndefined();

    heading.remove();
    expect(nested.data("count")).toBe(2);
    nested.data("afterRemoval", true);
    expect(documentObject._mdcuiIdStore.get("features").data.afterRemoval).toBe(true);
  });

  test("legal object ids discard decoy fields through arbitrary nesting", () => {
    const { $, heading } = webSelector();
    const objectTarget = {
      id: "features",
      innerHTML: "DECOY HTML",
      textContent: "DECOY TEXT",
      value: "DECOY VALUE",
    };
    const direct = $(objectTarget);
    expect(direct.text()).toBe(heading.textContent);
    expect(direct.val()).toEqual(["Search", "Offline"]);
    objectTarget.id = "missing";
    let nested = direct;
    for (let depth = 0; depth < 8; depth++) nested = $(nested);

    expect(nested.id).toBe("features");
    expect(nested.text()).toBe(heading.textContent);
    expect(nested.val()).toEqual(["Search", "Offline"]);
    expect(nested.val("Ignored")).toBe(nested);
    expect(heading.textContent).toBe("Features");
    expect(objectTarget.value).toBe("DECOY VALUE");
    expect(nested.push({ value: "Nested addition", checked: true })).toBe(4);
    expect(nested.val()).toEqual(["Search", "Offline", "Nested addition"]);
  });
});

describe("WUI object target wrapper", () => {
  test("supports $(this).text() and $(event.target).text()", () => {
    const { $, documentObject } = webSelector();
    const link = documentObject.createElement("a");
    link.append(documentObject.createTextNode("Save"));
    const wrapped = $(link);

    expect(wrapped.text()).toBe("Save");
    expect(wrapped.text("Saved")).toBe(wrapped);
    expect(link.textContent).toBe("Saved");
    expect($(link).text()).toBe("Saved");
  });

  test("val uses an object's value property or falls back to textContent", () => {
    const { $, documentObject } = webSelector();
    const input = documentObject.createElement("input");
    input.value = "old";
    const link = documentObject.createElement("a");
    link.append(documentObject.createTextNode("Open"));

    expect($(input).val()).toBe("old");
    $(input).val("new");
    expect(input.value).toBe("new");
    expect($(link).val()).toBe("Open");
    $(link).val("Close");
    expect(link.textContent).toBe("Close");
  });

  test("heading html hides the internal first-character toggle wrapper", () => {
    const { $ } = webSelector();
    const copy = {
      innerHTML: '<em><span class="mdcui-heading-toggle">T</span>itle</em>',
      querySelectorAll() {
        return [{
          childNodes: ["T"],
          replaceWith() {
            copy.innerHTML = "<em>Title</em>";
          },
        }];
      },
    };
    const heading = {
      tagName: "H2",
      cloneNode() {
        return copy;
      },
    };

    expect($(heading).html()).toBe("<em>Title</em>");
  });

  test("invalid object ids stay generic while missing legal ids do not", () => {
    const { $ } = webSelector();
    const invalidTargets = [
      { id: "9invalid", value: "numeric" },
      { id: "invalid id", value: "spaced" },
    ];
    const missing = { id: "missing", value: "decoy", textContent: "decoy" };

    for (const target of invalidTargets) {
      const wrapped = $(target);
      expect(wrapped.id).toBe("");
      expect(wrapped.val()).toBe(target.value);
      wrapped.val("updated");
      expect(target.value).toBe("updated");
    }
    expect($(missing).val()).toBe("");
    $(missing).val("ignored");
    expect(missing.value).toBe("decoy");
    expect(missing.textContent).toBe("decoy");
  });

  test("pure ids with selector punctuation use id lookup", () => {
    const documentObject = new TestDocument();
    const section = documentObject.createElement("section");
    const heading = documentObject.createElement("h2");
    heading.id = "feature:item";
    heading.append(documentObject.createTextNode("Punctuation ID"));
    section.append(heading);
    documentObject.root.append(section);
    documentObject.querySelector = () => {
      throw new SyntaxError("CSS parser treats ':' as a pseudo-class");
    };
    const $ = createWebDollar(documentObject);

    expect($("#feature:item").text()).toBe("Punctuation ID");
    expect($({ id: "feature:item", textContent: "DECOY" }).text())
      .toBe("Punctuation ID");
  });
});
