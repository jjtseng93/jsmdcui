import { expect, test } from "bun:test";
import {
  addTuiTableRowSeparators,
  markTuiTableStripeStyles,
  tuiTableStripeRows,
} from "../src/cui/table-render.mjs";

test("TUI tables receive full-width separators between every displayed row", () => {
  const markdown = `| A | B |
| --- | --- |
| one | first |
| two | second |
| three | third |
`;
  const rendered = String(Bun.markdown.ansi(
    markdown,
    { hyperlinks: true, columns: 40 },
  ));
  const decorated = addTuiTableRowSeparators(rendered);
  const lines = Bun.stripANSI(decorated).split("\n");
  const separators = lines.filter(line => /^├─+(?:┼─+)*┤$/u.test(line));

  expect(separators).toHaveLength(3);
  expect(new Set(separators)).toEqual(new Set([separators[0]]));
  expect(Bun.stringWidth(separators[0])).toBe(
    Bun.stringWidth(lines.find(line => line.startsWith("┌"))),
  );
});

test("wrapped visual table rows are separated without changing table width", () => {
  const markdown = `| A | B |
| --- | --- |
| this is a long cell that wraps | value |
| next | row |
`;
  const decorated = addTuiTableRowSeparators(String(Bun.markdown.ansi(
    markdown,
    { columns: 20 },
  )));
  const lines = Bun.stripANSI(decorated).split("\n");
  const topWidth = Bun.stringWidth(lines.find(line => line.startsWith("┌")));

  for (const line of lines.filter(line => /^[├│└]/u.test(line))) {
    expect(Bun.stringWidth(line)).toBe(topWidth);
  }
});

test("wide table cell text does not break rendered-row discovery", () => {
  const markdown = `| 名稱 | 狀態 |
| --- | --- |
| 中文 | 完成 |
| emoji | ✅ |
`;
  const lines = Bun.stripANSI(addTuiTableRowSeparators(String(
    Bun.markdown.ansi(markdown, { columns: 30 }),
  ))).split("\n");

  expect(lines.filter(line => /^├─+(?:┼─+)*┤$/u.test(line))).toHaveLength(2);
  expect([...tuiTableStripeRows(lines)]).toHaveLength(2);
});

test("TUI headers and even body display rows receive the colorscheme marker", () => {
  const lines = [
    "┌─────┬─────┐",
    "│ A   │ B   │",
    "├─────┼─────┤",
    "│ one │ 1   │",
    "├─────┼─────┤",
    "│ two │ 2   │",
    "├─────┼─────┤",
    "│ tri │ 3   │",
    "└─────┴─────┘",
  ];
  expect([...tuiTableStripeRows(lines)]).toEqual([1, 5]);

  const styles = lines.map(() => []);
  markTuiTableStripeStyles(styles, lines);
  expect(styles[1][0]?.mdcuiTableStripe).toBe(true);
  expect(styles[3][0]?.mdcuiTableStripe).toBeUndefined();
  expect(styles[5][0]?.mdcuiTableStripe).toBe(true);
  expect(styles[7][0]?.mdcuiTableStripe).toBeUndefined();
});

test("non-table box frames are left unchanged", () => {
  const ansi = "\x1b[2m┌─ js\x1b[0m\n\x1b[2m│ code\x1b[0m\n\x1b[2m└─\x1b[0m";
  expect(addTuiTableRowSeparators(ansi)).toBe(ansi);
});
