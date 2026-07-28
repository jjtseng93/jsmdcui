import {
  collectMarkdownHeadingDeclarations,
} from "./heading-ids.mjs";

function tableTopRange(line) {
  const text = String(line ?? "");
  const start = text.indexOf("┌");
  const end = text.lastIndexOf("┐");
  if (start < 0 || end <= start) return null;
  const frame = text.slice(start, end + 1);
  return /^┌─+(?:┬─+)*┐$/u.test(frame)
    ? { start, end, frame, prefix: text.slice(0, start) }
    : null;
}

function tableFrame(line, range) {
  const text = String(line ?? "");
  if (!text.startsWith(range.prefix)) return "";
  return text.slice(range.prefix.length).trimEnd();
}

function isTableBottom(line, range) {
  return /^└─+(?:┴─+)*┘$/u.test(tableFrame(line, range));
}

function isTableContentRow(line, range) {
  return /^│ .* │$/u.test(tableFrame(line, range));
}

function isTableSeparator(line, range) {
  return /^├─+(?:┼─+)*┤$/u.test(tableFrame(line, range));
}

function middleBorder(line, range) {
  const text = String(line ?? "");
  const frame = range.frame
    .replace("┌", "├")
    .replaceAll("┬", "┼")
    .replace("┐", "┤");
  return text.slice(0, range.start) + frame + text.slice(range.end + 1);
}

function unusedRowMarker(markdown) {
  const candidates = [
    "\u2060",
    "\u200b",
    "\u200c",
    "\u2061",
    "\u2062",
    "\u2063",
    "\ufeff",
  ];
  return candidates.find(marker => !markdown.includes(marker)) ?? null;
}

function tableDelimiter(line) {
  return /^\s*(?:>\s*)*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/u
    .test(String(line ?? ""));
}

function tableRow(line) {
  const text = String(line ?? "");
  return text.includes("|") && !/^\s*$/u.test(text);
}

function insertRowMarker(line, marker) {
  const text = String(line ?? "");
  const opening = /^(\s*(?:>\s*)*\|?\s*)/u.exec(text)?.[0] ?? "";
  return text.slice(0, opening.length) + marker + text.slice(opening.length);
}

export function markHeadingTableRows(markdown) {
  const source = String(markdown ?? "");
  const lines = source.split(/\r\n?|\n/u);
  const token = unusedRowMarker(source);
  const markers = [];
  if (!token) return { markdown: source, markers, token: null };
  let tableOrdinal = 0;

  const headings = collectMarkdownHeadingDeclarations(source, {
    includeEndLine: true,
  });
  for (const heading of headings) {
    let header = Math.max(0, Number(heading.endLine) || heading.line);
    while (header < lines.length && !lines[header].trim()) header++;
    const delimiter = header + 1;
    if (
      delimiter >= lines.length
      || !tableRow(lines[header])
      || !tableDelimiter(lines[delimiter])
    ) continue;

    const rows = [header];
    for (let row = delimiter + 1; row < lines.length; row++) {
      if (!tableRow(lines[row])) break;
      rows.push(row);
    }
    if (rows.length < 2) continue;

    for (const [rowOrdinal, lineIndex] of rows.entries()) {
      lines[lineIndex] = insertRowMarker(lines[lineIndex], token);
      markers.push({
        tableOrdinal,
        rowOrdinal,
        insertBefore: rowOrdinal > 1,
      });
    }
    tableOrdinal++;
  }

  return { markdown: lines.join("\n"), markers, token };
}

export function addTuiTableRowSeparators(ansiText, plan) {
  const markers = Array.isArray(plan?.markers) ? plan.markers : [];
  if (markers.length === 0) return String(ansiText ?? "");

  const ansiLines = String(ansiText ?? "").split("\n");
  const plainLines = Bun.stripANSI(String(ansiText ?? "")).split("\n");
  const output = [];
  const token = String(plan?.token ?? "");
  let markerOrdinal = 0;
  let activeRange = null;
  let activeTopLine = "";

  for (let index = 0; index < ansiLines.length; index++) {
    const top = tableTopRange(plainLines[index]);
    if (top) {
      activeRange = top;
      activeTopLine = plainLines[index];
    }

    const found = token && plainLines[index].includes(token)
      ? markers[markerOrdinal++]
      : null;
    if (found?.insertBefore && activeRange) {
      output.push(
        `\x1b[2m${middleBorder(activeTopLine, activeRange)}\x1b[0m`,
      );
    }
    let line = ansiLines[index];
    if (token) line = line.replaceAll(token, "");
    output.push(line);

    if (activeRange && isTableBottom(plainLines[index], activeRange)) {
      activeRange = null;
      activeTopLine = "";
    }
  }

  return output.join("\n");
}

export function tuiTableStripeRows(lines) {
  const input = Array.isArray(lines) ? lines : [];
  const striped = new Set();

  for (let index = 0; index < input.length; index++) {
    const range = tableTopRange(input[index]);
    if (!range) continue;
    let body = false;
    let bodyRow = 0;
    for (let row = index + 1; row < input.length; row++) {
      if (isTableBottom(input[row], range)) {
        index = row;
        break;
      }
      if (isTableSeparator(input[row], range)) {
        if (!body) {
          body = true;
          bodyRow = 1;
        } else {
          bodyRow++;
        }
        continue;
      }
      if (!isTableContentRow(input[row], range)) continue;
      if (!body) {
        striped.add(row);
        continue;
      }
      if (bodyRow % 2 === 0) striped.add(row);
    }
  }
  return striped;
}

export function markTuiTableStripeStyles(styleLines, lines) {
  if (!Array.isArray(styleLines) || !Array.isArray(lines)) return styleLines;
  for (const row of tuiTableStripeRows(lines)) {
    const line = String(lines[row] ?? "");
    const styles = styleLines[row] ?? (styleLines[row] = []);
    for (let index = 0; index < line.length; index++) {
      styles[index] = {
        ...(styles[index] ?? {}),
        mdcuiTableStripe: true,
      };
    }
  }
  return styleLines;
}
