import process from "node:process";
import { styleToAnsi } from "../display/ansi-style.js";
import { CellBuffer } from "./cell-buffer.js";
import { DISABLE_MOUSE, DISABLE_PASTE, ENABLE_MOUSE, ENABLE_PASTE, ResizeEvent } from "./events.js";

const CURSOR_SHAPE_SEQUENCE = {
  default: "\x1b[0 q",
  "blinking-block": "\x1b[1 q",
  block: "\x1b[2 q",
  "blinking-underline": "\x1b[3 q",
  underline: "\x1b[4 q",
  "blinking-bar": "\x1b[5 q",
  bar: "\x1b[6 q",
};

export function cursorShapeSequence(shape) {
  return CURSOR_SHAPE_SEQUENCE[shape] ?? CURSOR_SHAPE_SEQUENCE.block;
}

export class Screen {
  constructor({ mouse = true } = {}) {
    this.mouse = mouse;
    this.cols = process.stdout.columns || 80;
    this.rows = process.stdout.rows || 24;
    this.cells = new CellBuffer(this.cols, this.rows);
    this.previous = null;
    this.cursor = null;
    this.cursorVisible = false;
  }

  init() {
    this.write("\x1b[?1049h\x1b[?25l");
    if (this.mouse) this.write(ENABLE_MOUSE);
    this.write(ENABLE_PASTE);
  }

  fini() {
    if (this.mouse) this.write(DISABLE_MOUSE);
    this.write(DISABLE_PASTE);
    this.write("\x1b[0 q\x1b[?25h\x1b[?1049l\x1b[0m");
  }

  SetContent(x, y, ch, combining = [], style = null) {
    this.cells.setContent(x, y, ch, style, combining);
  }

  setContent(x, y, ch, style = null, combining = []) {
    this.SetContent(x, y, ch, combining, style);
  }

  setFillerContent(x, y, style = null) {
    this.cells.setFiller(x, y, style);
  }

  GetContent(x, y) {
    return this.cells.getContent(x, y);
  }

  getContent(x, y) {
    return this.GetContent(x, y);
  }

  Fill(ch = " ", style = null) {
    this.cells.fill(ch, style);
  }

  fill(ch = " ", style = null) {
    this.Fill(ch, style);
  }

  Show() {
    const changes = this.cells.diff(this.previous);
    let out = "\x1b[?25l";
    let activeStyleKey = null;
    for (const { x, y, cell } of changes) {
      if (cell.filler) continue; // right-half of a wide char; the base cell covers this column
      // If this is a wide char (next cell is its filler), clear the filler column with
      // default style first. On narrow-emoji terminals this leaves a default-bg blank
      // at the right-half column instead of stale cursor-line / syntax background, so
      // the area next to the glyph doesn't look like a colored block "covering" it.
      // On wide-emoji terminals the glyph's right half overwrites the blank harmlessly.
      const nextCell = this.cells.getContent(x + 1, y);
      if (nextCell?.filler) {
        out += this.move(y + 1, x + 2);
        out += styleToAnsi({});
        activeStyleKey = "";
        out += " ";
      }
      out += this.move(y + 1, x + 1);
      if (cell.styleKey !== activeStyleKey) {
        out += styleToAnsi(cell.style ?? {});
        activeStyleKey = cell.styleKey;
      }
      out += cell.ch + cell.combining.join("");
    }
    out += "\x1b[0m";
    if (this.cursor && this.cursorVisible) {
      out += cursorShapeSequence(this.cursor.shape) + this.move(this.cursor.y + 1, this.cursor.x + 1) + "\x1b[?25h";
    } else out += "\x1b[?25l";
    this.write(out);
    this.previous = this.cells.clone();
  }

  show() {
    this.Show();
  }

  setCursor(x, y, visible = true, shape = "block") {
    this.cursor = { x, y, shape };
    this.cursorVisible = visible;
  }

  hideCursor() {
    this.cursorVisible = false;
    this.write("\x1b[?25l");
  }

  showCursor() {
    this.cursorVisible = true;
    this.write("\x1b[?25h");
  }

  move(row, col) {
    return `\x1b[${row};${col}H`;
  }

  clearToEndOfLine() {
    return "\x1b[K";
  }

  updateSize() {
    this.cols = process.stdout.columns || this.cols;
    this.rows = process.stdout.rows || this.rows;
    this.cells.resize(this.cols, this.rows);
    this.previous = null;
    return new ResizeEvent(this.cols, this.rows);
  }

  write(data) {
    process.stdout.write(data);
  }
}
