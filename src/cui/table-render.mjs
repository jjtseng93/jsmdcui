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

export function addTuiTableRowSeparators(ansiText) {
  const ansiLines = String(ansiText ?? "").split("\n");
  const plainLines = Bun.stripANSI(String(ansiText ?? "")).split("\n");
  const output = [];

  for (let index = 0; index < ansiLines.length; index++) {
    const range = tableTopRange(plainLines[index]);
    output.push(ansiLines[index]);
    if (!range) continue;

    let bottom = index + 1;
    while (
      bottom < plainLines.length
      && !isTableBottom(plainLines[bottom], range)
    ) bottom++;
    if (bottom >= plainLines.length) continue;

    const separator = `\x1b[2m${middleBorder(plainLines[index], range)}\x1b[0m`;
    for (let row = index + 1; row < bottom; row++) {
      output.push(ansiLines[row]);
      if (
        isTableContentRow(plainLines[row], range)
        && isTableContentRow(plainLines[row + 1], range)
      ) output.push(separator);
    }
    index = bottom - 1;
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
        body = true;
        continue;
      }
      if (!isTableContentRow(input[row], range)) continue;
      if (!body) {
        striped.add(row);
        continue;
      }
      bodyRow++;
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
