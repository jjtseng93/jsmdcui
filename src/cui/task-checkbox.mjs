export function toggleTaskCheckboxBeforeColumn(line, column) {
  const text = String(line ?? "");
  const end = Math.max(0, Math.min(text.length, Math.trunc(Number(column) || 0) + 1));
  const prefix = text.slice(0, end);
  const uncheckedAt = prefix.lastIndexOf("☐");
  const checkedAt = prefix.lastIndexOf("☒");
  const checkboxAt = Math.max(uncheckedAt, checkedAt);

  if (checkboxAt < 0) return { line: text, toggled: false };

  const replacement = text[checkboxAt] === "☐" ? "☒" : "☐";
  return {
    line: text.slice(0, checkboxAt) + replacement + text.slice(checkboxAt + 1),
    toggled: true,
  };
}
