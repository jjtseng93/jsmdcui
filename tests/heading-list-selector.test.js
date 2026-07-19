import { describe, expect, test } from "bun:test";
import { createWebDollar } from "../src/cui/rpc.mjs";
import { createTuiSelector } from "../src/plugins/js-bridge.js";

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
    const { $ } = tuiSelector("## Empty\n\nParagraph.\n");
    expect($("#empty").push("No target")).toBe(0);
    expect($("#empty").unshift("No target")).toBe(0);
    expect($("#empty").pop()).toBeUndefined();
    expect($("#empty").shift()).toBeUndefined();
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
  return { $: createWebDollar(documentObject), list };
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
