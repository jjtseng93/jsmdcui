import { expect, test } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyPreRenderHeadingData,
  renderMarkdownTemplateComponents,
} from "../src/cui/template-components.mjs";
import {
  createWebDollar,
  installWebTemplateComponents,
} from "../src/cui/rpc.mjs";
import { createWui } from "../runmd.mjs";

test("four-backtick md template fences create heading components", () => {
  const result = renderMarkdownTemplateComponents(`# Users

before

\`\`\`\`md template
| Name | Active |
| --- | --- |
| Ada | yes |
\`\`\`\`

# Next
`);
  const record = result.idStore.get("users");
  const component = record.components[0];

  expect(component.id).toBe("users");
  expect(component.source).toBe(`| Name | Active |
| --- | --- |
| Ada | yes |`);
  expect(component.render(component.data)).toBe(component.source);
  expect(component.last).toBe(component.source);
  expect(component.data).toBe(record.data);
  expect(component.index).toBe(0);
  expect(component.marker.start).toMatch(/^\u2060/u);
  expect(component.marker.end).toMatch(/^\u2060/u);
  expect(result.markdown).toContain(
    `\n${component.marker.start}\n\n${component.source}\n\n${component.marker.end}\n`,
  );
  expect(result.markdown).toContain(component.source);
  expect(result.markdown).not.toContain("````md template");
});

test("components use the closest preceding heading and share its data", () => {
  const result = renderMarkdownTemplateComponents(`# Parent

\`\`\`\`md template
parent
\`\`\`\`

## Child

\`\`\`\`md template
one
\`\`\`\`

\`\`\`\`md template
two
\`\`\`\`
`);
  const parent = result.idStore.get("parent");
  const child = result.idStore.get("child");

  expect(parent.components).toHaveLength(1);
  expect(child.components).toHaveLength(2);
  expect(child.components[0].data).toBe(child.data);
  expect(child.components[1].data).toBe(child.data);
});

test("pre-render heading records merge without replacing existing data", () => {
  const existingData = Object.assign(Object.create(null), { count: 2 });
  const buffer = {
    _mdcuiIdStore: new Map([["users", {
      data: existingData,
      components: [{ last: "previous" }],
      headingVisibility: { hidden: true },
    }]]),
  };
  const scanned = renderMarkdownTemplateComponents(`# Users

\`\`\`\`md template
hello
\`\`\`\`
`);
  scanned.idStore.get("users").data.ready = true;

  applyPreRenderHeadingData(buffer, scanned.idStore);

  const record = buffer._mdcuiIdStore.get("users");
  expect(record.data).toBe(existingData);
  expect(record.data).toEqual({ count: 2, ready: true });
  expect(record.headingVisibility.hidden).toBe(true);
  expect(record.components[0].data).toBe(existingData);
  expect(record.components[0].last).toBe("hello");
});

test("ordinary and unclosed fences are left untouched", () => {
  const markdown = `# Demo

\`\`\`md template
ordinary
\`\`\`

\`\`\`\`md template
unclosed`;
  const result = renderMarkdownTemplateComponents(markdown);
  expect(result.markdown).toBe(markdown);
  expect(result.idStore.size).toBe(0);
});

test("WUI template payload hydrates the document id store", () => {
  const payload = {
    textContent: JSON.stringify([{
      id: "users",
      data: { count: 2 },
      components: [{ id: "users", source: "hello", last: "hello" }],
    }]),
  };
  const heading = { id: "users", tagName: "H1" };
  const documentObject = {
    getElementById(id) {
      return id === "mdcui-template-components" ? payload : heading;
    },
  };

  installWebTemplateComponents(documentObject);
  const data = createWebDollar(documentObject)("#users").data();
  const record = documentObject._mdcuiIdStore.get("users");

  expect(data).toBe(record.data);
  expect(data.count).toBe(2);
  expect(record.components[0].data).toBe(data);
  expect(record.components[0].render(data)).toBe("hello");
  expect(record.components[0].index).toBe(0);
});

test("createWui expands templates and embeds their component payload", async () => {
  const directory = await mkdtemp(join(tmpdir(), "jsmdcui-template-wui-"));
  const html = await createWui(`# Users

\`\`\`\`md template
| A | B |
| --- | --- |
| one | two |
\`\`\`\`
`, join(directory, "app.md"));

  expect(html).toContain("<table");
  expect(html).not.toContain("````md template");
  expect(html).toContain('<div class="mdcui-template" data-mdcui-heading-id="users" data-mdcui-component-index="0">');
  expect(html).toContain('id="mdcui-template-components"');
  expect(html).toContain('"id":"users"');
  expect(html).toContain('"source":"| A | B |\\n| --- | --- |\\n| one | two |"');
});
