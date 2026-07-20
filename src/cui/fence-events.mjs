const IDENTITY_RE = /^([A-Za-z_][\w:-]*)(?:#([A-Za-z_][\w:-]*))?((?:\.[A-Za-z_][\w:-]*)*)$/;

function parseIdentity(value) {
  const match = String(value ?? "").match(IDENTITY_RE);
  if (!match) return null;
  return {
    tag: match[1],
    id: match[2] || null,
    classes: match[3] ? match[3].slice(1).split(".") : [],
  };
}

function parseEventAttributes(text) {
  const events = new Map();
  let offset = 0;
  while (offset < text.length) {
    while (/\s/.test(text[offset] ?? "")) offset++;
    if (offset >= text.length || text[offset] !== "@") break;
    offset++;
    const nameStart = offset;
    while (/[A-Za-z0-9_.:-]/.test(text[offset] ?? "")) offset++;
    const name = text.slice(nameStart, offset);
    while (/\s/.test(text[offset] ?? "")) offset++;
    if (!name || text[offset] !== "=") break;
    offset++;
    while (/\s/.test(text[offset] ?? "")) offset++;
    if (text[offset] !== '"') break;
    offset++;

    let code = "";
    let closed = false;
    while (offset < text.length) {
      const ch = text[offset++];
      if (ch === '"') {
        closed = true;
        break;
      }
      if (ch === "\\" && offset < text.length) {
        const next = text[offset++];
        code += next === '"' || next === "\\" ? next : `\\${next}`;
      } else {
        code += ch;
      }
    }
    if (!closed) break;
    const [eventName, ...modifiers] = name.split(".");
    if (eventName) events.set(eventName, { code, modifiers: [...new Set(modifiers.filter(Boolean))] });
  }
  return events;
}

export function parseFenceDeclarations(markdown) {
  const lines = String(markdown ?? "").split(/\r?\n/);
  const declarations = [];
  let fence = null;

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (closing && closing[1][0] === fence.marker && closing[1].length >= fence.length)
        fence = null;
      continue;
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})([^]*)$/);
    if (!opening) continue;
    fence = { marker: opening[1][0], length: opening[1].length };
    const info = String(opening[2] ?? "").trim();
    const firstSpace = info.search(/\s/);
    const identityText = firstSpace < 0 ? info : info.slice(0, firstSpace);
    const attributesText = firstSpace < 0 ? "" : info.slice(firstSpace);
    const identity = parseIdentity(identityText);
    if (!identity) continue;
    declarations.push({
      ...identity,
      identity: identityText,
      events: parseEventAttributes(attributesText),
      line: index + 1,
      source: line.trim(),
    });
  }

  return declarations;
}

export function fenceEventMap(markdown) {
  const result = new Map();
  for (const declaration of parseFenceDeclarations(markdown)) {
    if (
      !["text", "textarea"].includes(declaration.tag)
      || !declaration.id
      || declaration.events.size === 0
      || result.has(declaration.id)
    ) continue;
    result.set(declaration.id, declaration);
  }
  return result;
}

export function inlineFenceEventCode(handler) {
  if (!handler) return "";
  const prefix = handler.modifiers.includes("prevent") ? "event.preventDefault();" : "";
  return prefix + handler.code;
}
