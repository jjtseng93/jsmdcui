function markdownHeadingDeclarations(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const declarations = [];
  let fence = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      const length = fenceMatch[1].length;
      if (!fence) fence = { marker, length };
      else if (marker === fence.marker && length >= fence.length) fence = null;
      continue;
    }
    if (fence) continue;

    const atx = line.match(/^ {0,3}(#{1,6})(?:[ \t]+(.*?)\s*#*\s*|[ \t]*)$/);
    if (atx) {
      declarations.push({
        line: index + 1,
        source: line.trim(),
        markdown: line,
      });
      continue;
    }

    if (index + 1 < lines.length && line.trim() && /^ {0,3}(?:=+|-+)\s*$/.test(lines[index + 1])) {
      declarations.push({
        line: index + 1,
        source: `${line.trim()} / ${lines[index + 1].trim()}`,
        markdown: `${line}\n${lines[index + 1]}`,
      });
      index++;
    }
  }

  if (!declarations.length) return [];
  const headingOnly = declarations.map((item) => item.markdown).join("\n\n");
  const html = String(Bun.markdown.html(headingOnly, { headings: { ids: true } }));
  const ids = [...html.matchAll(/<h[1-6]\b[^>]*\bid="([^"]*)"[^>]*>/gi)].map((match) => match[1]);
  return declarations.map((item, index) => ({
    id: ids[index] ?? "",
    kind: "heading",
    line: item.line,
    source: item.source,
  })).filter((item) => item.id);
}

function controlDeclarations(markdown) {
  const lines = String(markdown).split(/\r?\n/);
  const declarations = [];
  let fence = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (!fence) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})\s*(\S+)?\s*$/);
      if (!opening) continue;
      fence = { marker: opening[1][0], length: opening[1].length };
      const identity = String(opening[2] ?? "").match(/^(text|textarea)(?:#([A-Za-z_][\w:-]*))?(?:\.[A-Za-z_][\w:-]*)*$/);
      if (identity?.[2]) {
        declarations.push({
          id: identity[2],
          kind: `${identity[1]} control`,
          line: index + 1,
          source: line.trim(),
        });
      }
      continue;
    }

    const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
    if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length)
      fence = null;
  }

  return declarations;
}

export function checkMarkdownIdCollisions(markdown) {
  const declarations = [
    ...markdownHeadingDeclarations(markdown),
    ...controlDeclarations(markdown),
  ].sort((a, b) => a.line - b.line);
  const byId = new Map();
  for (const declaration of declarations) {
    if (!byId.has(declaration.id)) byId.set(declaration.id, []);
    byId.get(declaration.id).push(declaration);
  }
  const collisions = [...byId.entries()]
    .filter(([, items]) => items.length > 1)
    .map(([id, items]) => ({ id, declarations: items }));
  return { declarations, collisions };
}

function inlineCode(value) {
  const text = String(value);
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((match) => match[0].length));
  const delimiter = "`".repeat(longest + 1);
  const padding = text.startsWith("`") || text.endsWith("`") ? " " : "";
  return `${delimiter}${padding}${text}${padding}${delimiter}`;
}

export function formatMarkdownIdCheck(path, result) {
  const headings = result.declarations.filter((item) => item.kind === "heading").length;
  const controls = result.declarations.length - headings;
  const lines = [
    "# Markdown UI ID Check",
    "",
    `- File: ${inlineCode(path)}`,
    `- Selectable IDs: **${result.declarations.length}**`,
    `  * Headings: **${headings}**`,
    `  * Controls: **${controls}**`,
  ];

  if (!result.collisions.length) {
    lines.push("", "## PASS — No ID collisions found");
    return lines.join("\n");
  }

  lines.push("", `## FAIL — Found ${result.collisions.length} colliding ID(s)`);
  for (const collision of result.collisions) {
    lines.push("", `### ID ${inlineCode(`#${collision.id}`)}`);
    lines.push("", `- Declarations: **${collision.declarations.length}**`);
    for (const declaration of collision.declarations) {
      lines.push(`  * Line **${declaration.line}**`);
      lines.push(`    - Type: ${declaration.kind}`);
      lines.push(`    - Source: ${inlineCode(declaration.source)}`);
    }
  }
  lines.push("", "## Suggested fix", "", "- Rename the heading or control so every selectable ID is unique.");
  return lines.join("\n");
}
