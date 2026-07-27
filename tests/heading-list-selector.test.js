import { describe, expect, test } from "bun:test";
import { createWebDollar } from "../src/cui/rpc.mjs";
import {
  captureTuiRerenderState,
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

  test("object ids and nested selections retain the same heading identity", () => {
    const { $, buffer } = tuiSelector("## Features\n\n- [x] Search\n");
    const features = $("#features");
    const nested = $($($(features)));

    expect(features.id).toBe("features");
    expect(nested.id).toBe("features");
    features.data("count", 1);
    expect($({ id: "features" }).data("count")).toBe(1);
    expect(nested.data()).toBe(features.data());
    expect(nested.text()).toBe("Features");
    nested.hide();
    expect(buffer._mdcuiIdStore.get("features").headingVisibility.hidden).toBe(true);
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
  const list = documentObject.createElement("ul");
  appendWebItem(documentObject, list, "Search", true);
  appendWebItem(documentObject, list, "Notifications");
  appendWebItem(documentObject, list, "Offline", true);
  section.append(heading, list);
  documentObject.root.append(section);
  return { $: createWebDollar(documentObject), documentObject, section, heading, list };
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
});
