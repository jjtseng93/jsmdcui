import { existsSync, mkdirSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { dirname, join, basename, extname } from "node:path";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { assetPath, hasInternalAssets, listInternalAssetDirs, listInternalAssetPaths, readInternalAssetBytes } from "../runtime/assets.js";
import { newMessage, newMessageAtLine, MTError, MTWarning, MTInfo } from "../buffer/message.js";
import { Loc } from "../buffer/loc.js";

// ── Action registry ──────────────────────────────────────────────────────────

const ACTIONS = new Map();
const INTERNAL_JSPLUGIN_STAGE_ROOT = join(tmpdir(), "bunmicro-jsplugins");
let internalJsPluginStagePromise = null;

function reg(name, fn) { ACTIONS.set(name, fn); }

function stageInternalJsPlugins() {
  if (!internalJsPluginStagePromise) {
    internalJsPluginStagePromise = _stageInternalJsPlugins().catch((error) => {
      console.error("# failed to stage internal JS plugins");
      console.error(error);
      return null;
    });
  }
  return internalJsPluginStagePromise;
}

async function _stageInternalJsPlugins() {
  const prefix = assetPath("runtime", "jsplugins");
  const paths = listInternalAssetPaths(prefix);
  if (paths.length === 0) return null;

  mkdirSync(INTERNAL_JSPLUGIN_STAGE_ROOT, { recursive: true });
  await Bun.write(join(INTERNAL_JSPLUGIN_STAGE_ROOT, "package.json"), JSON.stringify({ type: "module" }));

  for (const assetPathName of paths) {
    const bytes = readInternalAssetBytes(assetPathName);
    if (!bytes) continue;
    const stagedPath = join(INTERNAL_JSPLUGIN_STAGE_ROOT, ...assetPathName.split("/"));
    mkdirSync(dirname(stagedPath), { recursive: true });
    await Bun.write(stagedPath, bytes);
  }

  return INTERNAL_JSPLUGIN_STAGE_ROOT;
}

function _actIndentStr(buf) {
  if (buf?.Settings?.tabstospaces) return " ".repeat(buf?.Settings?.tabsize ?? 4);
  return "\t";
}

function _actExtendSel(app, moveFn) {
  const pane = app.pane;
  const buf = app.buffer;
  if (!pane || !buf) return;
  const anchor = pane.selection?.start ?? { ...buf.cursor };
  moveFn(buf);
  const end = { ...buf.cursor };
  const same = anchor?.x === end?.x && anchor?.y === end?.y;
  pane.selection = same ? null : { start: anchor, end };
}

function _actSelBounds(sel) {
  const a = sel.start, b = sel.end;
  const first = (a.y < b.y || (a.y === b.y && a.x <= b.x)) ? a : b;
  const last = first === a ? b : a;
  return { first, last };
}

function registerBuiltinActions() {
  // Cursor movement
  reg("CursorUp",              (app) => { app.pane && (app.pane.selection = null); app.buffer?._moveUpVisual?.() ?? app.buffer?.moveUp(); });
  reg("CursorDown",            (app) => { app.pane && (app.pane.selection = null); app.buffer?._moveDownVisual?.() ?? app.buffer?.moveDown(); });
  reg("CursorLeft",            (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveLeft(); });
  reg("CursorRight",           (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveRight(); });
  reg("WordRight",             (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveWordRight(); });
  reg("WordLeft",              (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveWordLeft(); });
  reg("CursorWordRight",       (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveWordRight(); });
  reg("CursorWordLeft",        (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveWordLeft(); });
  reg("StartOfLine",           (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveHome(); });
  reg("StartOfText",           (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveStartOfText(); });
  reg("StartOfTextToggle",     (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveStartOfTextToggle(); });
  reg("EndOfLine",             (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveEnd(); });
  reg("CursorStart",           (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveStartOfBuffer(); app.scrollCursorToBoundary?.(app.pane, "start"); });
  reg("CursorEnd",             (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveEndOfBuffer();   app.scrollCursorToBoundary?.(app.pane, "end");   });
  reg("ParagraphPrevious",     (app) => { app.pane && (app.pane.selection = null); app.buffer?.paragraphPrevious(); });
  reg("ParagraphNext",         (app) => { app.pane && (app.pane.selection = null); app.buffer?.paragraphNext(); });
  reg("PageUp",                (app) => { app.pane && (app.pane.selection = null); app.pageScroll?.(app.pane, -1); });
  reg("PageDown",              (app) => { app.pane && (app.pane.selection = null); app.pageScroll?.(app.pane, 1); });

  // Selection — extend
  reg("SelectUp",              (app) => _actExtendSel(app, (buf) => buf._moveUpVisual?.() ?? buf.moveUp?.()));
  reg("SelectDown",            (app) => _actExtendSel(app, (buf) => buf._moveDownVisual?.() ?? buf.moveDown?.()));
  reg("SelectLeft",            (app) => _actExtendSel(app, (buf) => buf.moveLeft?.()));
  reg("SelectRight",           (app) => _actExtendSel(app, (buf) => buf.moveRight?.()));
  reg("SelectWordRight",       (app) => _actExtendSel(app, (buf) => buf.moveWordRight?.()));
  reg("SelectWordLeft",        (app) => _actExtendSel(app, (buf) => buf.moveWordLeft?.()));
  reg("SelectToStartOfText",   (app) => _actExtendSel(app, (buf) => buf.moveStartOfText?.()));
  reg("SelectToStartOfTextToggle", (app) => _actExtendSel(app, (buf) => buf.moveStartOfTextToggle?.()));
  reg("SelectToStartOfLine",   (app) => _actExtendSel(app, (buf) => buf.moveHome?.()));
  reg("SelectToEndOfLine",     (app) => _actExtendSel(app, (buf) => buf.moveEnd?.()));
  reg("SelectToStart",         (app) => _actExtendSel(app, (buf) => buf.moveStartOfBuffer?.()));
  reg("SelectToEnd",           (app) => _actExtendSel(app, (buf) => buf.moveEndOfBuffer?.()));
  reg("SelectPageUp",          (app) => app.cursorPage?.(app.pane, -1, { select: true }));
  reg("SelectPageDown",        (app) => app.cursorPage?.(app.pane, 1, { select: true }));
  reg("SelectToParagraphPrevious", (app) => _actExtendSel(app, (buf) => buf.paragraphPrevious?.()));
  reg("SelectToParagraphNext",     (app) => _actExtendSel(app, (buf) => buf.paragraphNext?.()));

  // Selection — whole-range
  reg("SelectAll", (app) => {
    const buf = app.buffer;
    const pane = app.pane;
    if (!buf || !pane) return;
    const end = { x: buf.lines.at(-1)?.length ?? 0, y: buf.lines.length - 1 };
    pane.selection = { start: { x: 0, y: 0 }, end };
    buf.cursor = { ...end };
  });
  reg("SelectLine", (app) => {
    const buf = app.buffer;
    const pane = app.pane;
    if (!buf || !pane) return;
    const y = buf.cursor.y;
    pane.selection = { start: { x: 0, y }, end: { x: buf.lines[y]?.length ?? 0, y } };
    buf.cursor = { ...pane.selection.end };
  });
  reg("Deselect", (app) => { if (app.pane) app.pane.selection = null; });

  // Indent/Outdent with selection support
  reg("IndentSelection", (app) => {
    const buf = app.buffer;
    const pane = app.pane;
    if (!buf) return;
    if (!pane?.selection) { buf.insertTab?.(); return; }
    buf.pushUndo?.();
    const indent = _actIndentStr(buf);
    const { first, last } = _actSelBounds(pane.selection);
    for (let y = first.y; y <= last.y; y++) {
      if ((buf.lines[y] ?? "").length > 0) buf.lines[y] = indent + (buf.lines[y] ?? "");
    }
    buf.invalidateHighlightFrom?.(first.y, { force: first.y !== last.y });
    pane.selection = {
      start: { ...pane.selection.start, x: pane.selection.start.x > 0 ? pane.selection.start.x + indent.length : pane.selection.start.x },
      end: { ...pane.selection.end, x: pane.selection.end.x + indent.length },
    };
    buf.cursor = { ...buf.cursor, x: buf.cursor.x + indent.length };
    buf.ensureCursor?.();
    buf.modified = true;
  });
  reg("OutdentSelection", (app) => {
    const buf = app.buffer;
    const pane = app.pane;
    if (!buf) return;
    if (!pane?.selection) {
      // outdent current line
      const indent = _actIndentStr(buf);
      const line = buf.lines[buf.cursor.y] ?? "";
      buf.pushUndo?.();
      let n = 0;
      if (line.startsWith(indent)) n = indent.length;
      else if (line.startsWith("\t")) n = 1;
      else { while (n < indent.length && line[n] === ' ') n++; }
      if (n > 0) {
        buf.lines[buf.cursor.y] = line.slice(n);
        buf.cursor.x = Math.max(0, buf.cursor.x - n);
        buf.invalidateHighlightFrom?.(buf.cursor.y);
        buf.modified = true;
      }
      return;
    }
    buf.pushUndo?.();
    const indent = _actIndentStr(buf);
    const { first, last } = _actSelBounds(pane.selection);
    for (let y = first.y; y <= last.y; y++) {
      const line = buf.lines[y] ?? "";
      let n = 0;
      if (line.startsWith(indent)) n = indent.length;
      else if (line.startsWith("\t")) n = 1;
      else { while (n < indent.length && line[n] === ' ') n++; }
      if (n > 0) buf.lines[y] = line.slice(n);
    }
    buf.invalidateHighlightFrom?.(first.y, { force: first.y !== last.y });
    pane.selection = {
      start: { ...pane.selection.start, x: Math.max(0, pane.selection.start.x - indent.length) },
      end: { ...pane.selection.end, x: Math.max(0, pane.selection.end.x - indent.length) },
    };
    buf.cursor = { ...buf.cursor, x: Math.max(0, buf.cursor.x - indent.length) };
    buf.ensureCursor?.();
    buf.modified = true;
  });
  reg("IndentLine", (app) => {
    const buf = app.buffer;
    if (!buf || app.pane?.selection) return;
    buf.pushUndo?.();
    const indent = _actIndentStr(buf);
    buf.lines[buf.cursor.y] = indent + (buf.lines[buf.cursor.y] ?? "");
    buf.cursor.x += indent.length;
    buf.invalidateHighlightFrom?.(buf.cursor.y);
    buf.modified = true;
  });
  reg("OutdentLine", (app) => {
    const buf = app.buffer;
    if (!buf || app.pane?.selection) return;
    const indent = _actIndentStr(buf);
    const line = buf.lines[buf.cursor.y] ?? "";
    buf.pushUndo?.();
    let n = 0;
    if (line.startsWith(indent)) n = indent.length;
    else if (line.startsWith("\t")) n = 1;
    else { while (n < indent.length && line[n] === ' ') n++; }
    if (n > 0) {
      buf.lines[buf.cursor.y] = line.slice(n);
      buf.cursor.x = Math.max(0, buf.cursor.x - n);
      buf.invalidateHighlightFrom?.(buf.cursor.y);
      buf.modified = true;
    }
  });
  // Aliases for OutdentSelection / OutdentLine
  reg("DedentSelection",   (app) => ACTIONS.get("OutdentSelection")(app));
  reg("UnindentSelection", (app) => ACTIONS.get("OutdentSelection")(app));
  reg("DedentLine",        (app) => ACTIONS.get("OutdentLine")(app));
  reg("UnindentLine",      (app) => ACTIONS.get("OutdentLine")(app));

  // Editing
  reg("Backspace",          (app) => app.buffer?.backspace());
  reg("Delete",             (app) => app.buffer?.deleteForward());
  reg("InsertNewline",      (app) => app.buffer?.newline());
  reg("InsertTab",          (app) => app.buffer?.insertTab());
  reg("Undo",               (app) => app.buffer?.undo());
  reg("Redo",               (app) => app.buffer?.redo());
  reg("DeleteWordLeft",     (app) => { app.buffer?.pushUndo?.(); app.buffer?.moveWordLeft && (() => { const start = {...app.buffer.cursor}; app.buffer.moveWordLeft(); const end = {...app.buffer.cursor}; if (start.y !== end.y || start.x !== end.x) { app.buffer.lines[end.y] = (app.buffer.lines[end.y] ?? "").slice(0, end.x) + (app.buffer.lines[start.y] ?? "").slice(start.x); app.buffer.invalidateHighlightFrom?.(end.y); app.buffer.modified = true; } })(); });
  reg("DeleteWordRight",    (app) => { app.buffer?.pushUndo?.(); if (app.buffer?.moveWordRight) { const start = {...app.buffer.cursor}; app.buffer.moveWordRight(); const end = {...app.buffer.cursor}; if (start.y !== end.y || start.x !== end.x) { app.buffer.lines[start.y] = (app.buffer.lines[start.y] ?? "").slice(0, start.x) + (app.buffer.lines[end.y] ?? "").slice(end.x); app.buffer.cursor = {...start}; app.buffer.invalidateHighlightFrom?.(start.y); app.buffer.modified = true; } } });

  // Line operations
  reg("MoveLinesUp", (app) => {
    const buf = app.buffer;
    const pane = app.pane;
    if (!buf) return;
    buf.pushUndo?.();
    if (pane?.selection) {
      const { first, last } = _actSelBounds(pane.selection);
      if (first.y === 0) return;
      const moved = buf.lines.splice(first.y - 1, 1)[0];
      buf.lines.splice(last.y, 0, moved);
      pane.selection = {
        start: { ...pane.selection.start, y: pane.selection.start.y - 1 },
        end: { ...pane.selection.end, y: pane.selection.end.y - 1 },
      };
      buf.cursor = { ...buf.cursor, y: buf.cursor.y - 1 };
      buf.invalidateHighlightFrom?.(first.y - 1, { force: true });
    } else {
      if (buf.cursor.y === 0) return;
      const y = buf.cursor.y;
      [buf.lines[y - 1], buf.lines[y]] = [buf.lines[y], buf.lines[y - 1]];
      buf.cursor.y--;
      buf.invalidateHighlightFrom?.(y - 1, { force: true });
    }
    buf.modified = true;
  });
  reg("MoveLinesDown", (app) => {
    const buf = app.buffer;
    const pane = app.pane;
    if (!buf) return;
    buf.pushUndo?.();
    if (pane?.selection) {
      const { first, last } = _actSelBounds(pane.selection);
      if (last.y >= buf.lines.length - 1) return;
      const moved = buf.lines.splice(last.y + 1, 1)[0];
      buf.lines.splice(first.y, 0, moved);
      pane.selection = {
        start: { ...pane.selection.start, y: pane.selection.start.y + 1 },
        end: { ...pane.selection.end, y: pane.selection.end.y + 1 },
      };
      buf.cursor = { ...buf.cursor, y: buf.cursor.y + 1 };
      buf.invalidateHighlightFrom?.(first.y, { force: true });
    } else {
      if (buf.cursor.y >= buf.lines.length - 1) return;
      const y = buf.cursor.y;
      [buf.lines[y], buf.lines[y + 1]] = [buf.lines[y + 1], buf.lines[y]];
      buf.cursor.y++;
      buf.invalidateHighlightFrom?.(y, { force: true });
    }
    buf.modified = true;
  });
  reg("DuplicateLine", (app) => {
    const buf = app.buffer;
    if (!buf) return;
    const line = buf.lines[buf.cursor.y];
    buf.lines.splice(buf.cursor.y + 1, 0, line);
    buf.cursor.y++;
    buf.invalidateHighlightFrom?.(buf.cursor.y, { force: true });
    buf.modified = true;
  });
  reg("DeleteLine", (app) => app.buffer?.cutLine());

  // Clipboard — delegate to handleCommand so clipboard manager is used
  reg("Copy",    (app) => app.handleCommand?.("copy"));
  reg("CopyLine",(app) => app.handleCommand?.("copy"));
  reg("Cut",     (app) => app.handleCommand?.("cut"));
  reg("Paste",   (app) => app.handleCommand?.("paste"));
  reg("CutLine", (app) => app.handleCommand?.("cutline"));

  // Comment
  reg("ToggleComment", (app) => app.toggleComment?.());

  // File / tab
  reg("Save",        async (app) => app.save?.());
  reg("SaveAs",      (app) => app.openCommandMode?.());
  reg("Quit",        async (app) => app.quit?.());
  reg("AddTab",      async (app) => app.addTab?.());
  reg("NextTab",     (app) => app.nextTab?.());
  reg("PrevTab",     (app) => app.previousTab?.());
  reg("PreviousTab", (app) => app.previousTab?.());

  // View / search
  reg("Find",        (app) => app.handleCommand?.("find"));
  reg("CommandMode", (app) => app.openCommandMode?.());
  reg("ShellMode",   (app) => app.openShellMode?.());
  reg("ToggleHelp",  (app) => app.toggleHelp?.());
  reg("ToggleRuler", (app) => {
    const buf = app.buffer; if (!buf) return;
    buf.Settings = buf.Settings ?? {};
    buf.Settings.ruler = !(buf.Settings.ruler ?? true);
    app.message = buf.Settings.ruler ? "Enabled ruler" : "Disabled ruler";
  });

  // Scroll without moving cursor
  reg("ScrollUp",    (app) => { if (app.buffer) app.buffer.scroll.y = Math.max(0, (app.buffer.scroll.y ?? 0) - 3); });
  reg("ScrollDown",  (app) => { if (app.buffer) app.buffer.scroll.y = (app.buffer.scroll.y ?? 0) + 3; });

  // Start / End — move cursor + scroll to buffer boundary
  reg("Start", (app) => { app.pane && (app.pane.selection = null); app.buffer?._lastVisX != null && (app.buffer._lastVisX = null); app.buffer?.moveStartOfBuffer(); app.scrollCursorToBoundary?.(app.pane, "start"); });
  reg("End",   (app) => { app.pane && (app.pane.selection = null); app.buffer?._lastVisX != null && (app.buffer._lastVisX = null); app.buffer?.moveEndOfBuffer();   app.scrollCursorToBoundary?.(app.pane, "end");   });

  // Page aliases
  reg("CursorPageUp",    (app) => app.cursorPage?.(app.pane, -1));
  reg("CursorPageDown",  (app) => app.cursorPage?.(app.pane, 1));
  reg("HalfPageUp",      (app) => app.cursorPage?.(app.pane, -1, { amount: Math.max(1, Math.floor((app.pane?.h ?? 24) / 2)) }));
  reg("HalfPageDown",    (app) => app.cursorPage?.(app.pane, 1, { amount: Math.max(1, Math.floor((app.pane?.h ?? 24) / 2)) }));

  // Cursor-to-view-boundary
  reg("CursorToViewTop", (app) => {
    const buf = app.buffer; if (!buf) return;
    app.pane && (app.pane.selection = null);
    buf.cursor.y = Math.min(buf.lines.length - 1, Math.max(0, buf.scroll.y ?? 0));
    buf.ensureCursor?.();
  });
  reg("CursorToViewCenter", (app) => {
    const buf = app.buffer; if (!buf) return;
    app.pane && (app.pane.selection = null);
    buf.cursor.y = Math.min(buf.lines.length - 1, Math.max(0, (buf.scroll.y ?? 0) + Math.floor((app.pane?.h ?? 24) / 2)));
    buf.ensureCursor?.();
  });
  reg("CursorToViewBottom", (app) => {
    const buf = app.buffer; if (!buf) return;
    app.pane && (app.pane.selection = null);
    buf.cursor.y = Math.min(buf.lines.length - 1, Math.max(0, (buf.scroll.y ?? 0) + (app.pane?.h ?? 24) - 1));
    buf.ensureCursor?.();
  });

  // Center — scroll so cursor is vertically centered
  reg("Center", (app) => {
    const buf = app.buffer; if (!buf) return;
    buf.scroll.y = Math.max(0, buf.cursor.y - Math.floor((app.pane?.h ?? 24) / 2));
    buf.scroll.row = 0;
  });

  // Search
  reg("FindNext",     (app) => { app.buffer?.searchNext?.(); });
  reg("FindPrevious", (app) => { app.buffer?.searchPrev?.(); });
  reg("FindLiteral",  (app) => { app.buffer?.searchNext?.(); });
  reg("ToggleHighlightSearch", (app) => {
    const buf = app.buffer; if (!buf) return;
    buf.Settings = buf.Settings ?? {};
    buf.Settings.hlsearch = !(buf.Settings.hlsearch ?? false);
    app.message = buf.Settings.hlsearch ? "Enabled search highlight" : "Disabled search highlight";
  });
  reg("UnhighlightSearch", (app) => { if (app.buffer) { app.buffer.searchPattern = ""; } });
  reg("ResetSearch",       (app) => { if (app.buffer) { app.buffer.searchPattern = ""; } });

  // Diff navigation (requires app.diffNext/diffPrevious added to App class)
  reg("DiffNext",     (app) => app.diffNext?.());
  reg("DiffPrevious", (app) => app.diffPrevious?.());

  // Duplicate selection or line
  reg("Duplicate", (app) => {
    const buf = app.buffer; const pane = app.pane; if (!buf) return;
    buf.pushUndo?.();
    if (pane?.selection) {
      const { first, last } = _actSelBounds(pane.selection);
      const selLines = buf.lines;
      const getText = () => {
        if (first.y === last.y) return (selLines[first.y] ?? "").slice(first.x, last.x);
        const parts = [(selLines[first.y] ?? "").slice(first.x)];
        for (let i = first.y + 1; i < last.y; i++) parts.push(selLines[i] ?? "");
        parts.push((selLines[last.y] ?? "").slice(0, last.x));
        return parts.join("\n");
      };
      const selText = getText();
      const parts = selText.split("\n");
      const line = buf.lines[last.y] ?? "";
      const right = line.slice(last.x);
      if (parts.length === 1) {
        buf.lines[last.y] = line.slice(0, last.x) + parts[0] + right;
        buf.cursor = { y: last.y, x: last.x + parts[0].length };
        buf.invalidateHighlightFrom?.(last.y);
      } else {
        buf.lines[last.y] = line.slice(0, last.x) + parts[0];
        buf.lines.splice(last.y + 1, 0, ...parts.slice(1, -1), parts.at(-1) + right);
        buf.cursor = { y: last.y + parts.length - 1, x: parts.at(-1).length };
        buf.invalidateHighlightFrom?.(last.y, { force: true });
      }
      pane.selection = null;
      buf.modified = true;
    } else {
      const lineText = buf.lines[buf.cursor.y] ?? "";
      buf.lines.splice(buf.cursor.y + 1, 0, lineText);
      buf.invalidateHighlightFrom?.(buf.cursor.y, { force: true });
      buf.cursor = { y: buf.cursor.y + 1, x: lineText.length };
      buf.modified = true;
    }
  });

  // Retab — re-indent all lines to match tabstospaces/tabsize setting
  reg("Retab", (app) => {
    const buf = app.buffer; if (!buf) return;
    const tabsize = Math.max(1, buf.Settings?.tabsize ?? 4);
    const toSpaces = buf.Settings?.tabstospaces ?? false;
    buf.pushUndo?.();
    for (let y = 0; y < buf.lines.length; y++) {
      const line = buf.lines[y];
      let i = 0; let col = 0;
      while (i < line.length && (line[i] === " " || line[i] === "\t")) {
        if (line[i] === "\t") col = Math.floor(col / tabsize) * tabsize + tabsize;
        else col++;
        i++;
      }
      if (i === 0) continue;
      const newIndent = toSpaces ? " ".repeat(col) : "\t".repeat(Math.floor(col / tabsize)) + " ".repeat(col % tabsize);
      if (newIndent !== line.slice(0, i)) {
        buf.lines[y] = newIndent + line.slice(i);
        buf.invalidateHighlightFrom?.(y);
      }
    }
    buf.modified = true;
    buf.ensureCursor?.();
    app.message = `Retabbed (${toSpaces ? "spaces" : "tabs"}, size ${tabsize})`;
  });

  // Autocomplete
  reg("Autocomplete",          (app) => { if (app.buffer?.acHas) app.buffer.cycleAutocomplete?.(true); else app.buffer?.startBufferComplete?.(); });
  reg("CycleAutocompleteBack", (app) => { app.buffer?.cycleAutocomplete?.(false); });

  // Tab navigation
  reg("FirstTab", (app) => app.setActiveTab?.(0));
  reg("LastTab",  (app) => app.setActiveTab?.((app.tabs?.length ?? 1) - 1));

  // Split pane navigation
  reg("NextSplit",     (app) => { const panes = app.tab?.panes(); if (panes?.length > 1) app.tab.activePane = panes[(panes.indexOf(app.tab.activePane) + 1) % panes.length]; });
  reg("PreviousSplit", (app) => { const panes = app.tab?.panes(); if (panes?.length > 1) app.tab.activePane = panes[(panes.indexOf(app.tab.activePane) - 1 + panes.length) % panes.length]; });
  reg("FirstSplit",    (app) => { const panes = app.tab?.panes(); if (panes?.length) app.tab.activePane = panes[0]; });
  reg("LastSplit",     (app) => { const panes = app.tab?.panes(); if (panes?.length) app.tab.activePane = panes[panes.length - 1]; });

  // Split actions (delegate to handleCommand for buffer opening)
  reg("VSplitAction", async (app) => app.handleCommand?.("vsplit"));
  reg("HSplitAction", async (app) => app.handleCommand?.("hsplit"));
  reg("Unsplit", (app) => { if ((app.tab?.panes().length ?? 0) > 1) app.closePane?.(app.pane); });

  // File operations
  reg("OpenFile",  (app) => app.openCommandMode?.("open "));
  reg("SaveAll",   async (app) => {
    let saved = 0;
    for (const tab of (app.tabs ?? [])) {
      for (const pane of (tab.panes?.() ?? [])) {
        if (pane?.buffer?.modified) {
          try { await pane.buffer.save?.(); saved++; } catch {}
        }
      }
    }
    app.message = saved > 0 ? `Saved ${saved} file${saved === 1 ? "" : "s"}` : "Nothing to save";
  });
  reg("JumpLine",            (app) => app.openCommandMode?.("goto "));
  reg("JumpToMatchingBrace", (app) => app.jumpToMatchingBrace?.());

  // Quit actions
  reg("ForceQuit", async (app) => app.stop?.(0));
  reg("QuitAll",   async (app) => {
    for (const tab of (app.tabs ?? []))
      for (const pane of (tab.panes?.() ?? []))
        if (pane?.buffer?.modified) try { await pane.buffer.save?.(); } catch {}
    await app.stop?.(0);
  });
  reg("Escape", (app) => app._dispatchInput?.(new TextEncoder().encode("\x1b")));

  // Toggle settings
  reg("ToggleDiffGutter", (app) => {
    const buf = app.buffer; if (!buf) return;
    buf.Settings = buf.Settings ?? {};
    buf.Settings.diffgutter = !(buf.Settings.diffgutter ?? false);
    app.message = buf.Settings.diffgutter ? "Enabled diff gutter" : "Disabled diff gutter";
  });
  reg("ToggleKeyMenu", (app) => { app.keymenu = !(app.keymenu ?? false); });
  reg("ToggleOverwriteMode", (app) => {
    const buf = app.buffer; if (!buf) return;
    buf._overwrite = !buf._overwrite;
    app.message = buf._overwrite ? "Overwrite mode on" : "Overwrite mode off";
  });

  // Paste from primary selection (X11/Wayland middle-click clipboard)
  reg("PastePrimary", (app) => {
    const pasted = app.clipboard?.read?.("primary");
    if (!pasted) return;
    const buf = app.buffer; if (!buf) return;
    buf.pushUndo?.();
    if (app.pane?.selection) _deleteSel(buf, app.pane);
    buf.insert?.(pasted);
    app.message = "Pasted from primary selection";
  });

  // Status/info
  reg("ClearInfo",   (app) => { app.message = ""; if (app.buffer) app.buffer.message = ""; });
  reg("ClearStatus", (app) => { app.message = ""; if (app.buffer) app.buffer.message = ""; });
  reg("None",        () => {});

  // SubWord — stub: treated as word movement (no sub-word segmentation implemented)
  reg("SubWordLeft",         (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveWordLeft?.(); });
  reg("SubWordRight",        (app) => { app.pane && (app.pane.selection = null); app.buffer?.moveWordRight?.(); });
  reg("SelectSubWordLeft",   (app) => _actExtendSel(app, (buf) => buf.moveWordLeft?.()));
  reg("SelectSubWordRight",  (app) => _actExtendSel(app, (buf) => buf.moveWordRight?.()));
}

// Register all built-in actions at module load time
registerBuiltinActions();

// ── Public action API ────────────────────────────────────────────────────────

const EDIT_LOCKED_ACTIONS = new Set([
  "IndentSelection", "OutdentSelection", "IndentLine", "OutdentLine",
  "DedentSelection", "UnindentSelection", "DedentLine", "UnindentLine",
  "Backspace", "Delete", "InsertNewline", "InsertTab", "Undo", "Redo",
  "DeleteWordLeft", "DeleteWordRight",
  "MoveLinesUp", "MoveLinesDown", "DuplicateLine", "DeleteLine",
  "Cut", "Paste", "CutLine", "ToggleComment", "Duplicate", "Retab", "PastePrimary",
]);

export async function runAction(name, app) {
  const fn = ACTIONS.get(name);
  if (!fn) return false;
  if (app?.buffer?.isEditLocked?.() && EDIT_LOCKED_ACTIONS.has(name)) return true;
  await fn(app);
  return true;
}

export function listActions() {
  return [...ACTIONS.keys()].sort();
}

// ── JsPluginManager ──────────────────────────────────────────────────────────

export class JsPluginManager {
  constructor() {
    this._hooks  = new Map();   // hookName → fn[]
    this.commands = new Map();
    this._loaded = [];          // { path, name, error? }
    this._app    = null;
    this._ctx    = null;
    // registerBuiltinActions() already called at module load time
  }

  setApp(app)     { this._app = app; }
  setContext(ctx) { this._ctx = ctx; }

  // Register a hook handler from a JS plugin
  on(hookName, fn) {
    if (!this._hooks.has(hookName)) this._hooks.set(hookName, []);
    this._hooks.get(hookName).push(fn);
  }

  // Dispatch a hook to all JS handlers (fire-and-forget style like Lua run)
  async run(hookName, ...args) {
    for (const fn of (this._hooks.get(hookName) ?? [])) {
      try { await fn(...args); } catch (e) { console.error(`[jsplugin] ${hookName}:`, e.message); }
    }
  }

  async runBool(hookName, ...args) {
    let ok = true;
    for (const fn of (this._hooks.get(hookName) ?? [])) {
      try {
        if (await fn(...args) === false) ok = false;
      } catch (e) { console.error(`[jsplugin] ${hookName}:`, e.message); }
    }
    return ok;
  }

  // Scan and load all JS plugins from given directories
  async loadFrom(dirs) {
    for (const { dir, builtin } of dirs) {
      if (builtin && hasInternalAssets()) {
        const loadedFromAssets = await this._loadFromInternalAssets(dir, builtin);
        if (loadedFromAssets) continue;
      }
      if (!existsSync(dir)) continue;
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const plugDir = join(dir, entry.name);
        const mainJs = join(plugDir, `${entry.name}.js`);
        if (!existsSync(mainJs)) continue;
        await this._loadFile(mainJs, entry.name, builtin);
      }
    }
  }

  async _loadFromInternalAssets(dir, builtin) {
    const prefix = assetPath("runtime", "jsplugins");
    const stageRoot = await stageInternalJsPlugins();
    if (!stageRoot) return false;

    const pluginNames = listInternalAssetDirs(prefix);
    if (pluginNames.length === 0) return false;

    let loadedAny = false;
    for (const pluginName of pluginNames) {
      const stagedMainPath = join(stageRoot, prefix, pluginName, `${pluginName}.js`);
      if (!existsSync(stagedMainPath)) continue;
      try {
        await import(pathToFileURL(stagedMainPath).href);
        this._loaded.push({ path: assetPath(prefix, pluginName, `${pluginName}.js`), name: pluginName, builtin, loaded: true });
        loadedAny = true;
      } catch (e) {
        this._loaded.push({ path: assetPath(prefix, pluginName, `${pluginName}.js`), name: pluginName, builtin, loaded: false, error: e.message });
        console.error(`[jsplugin] failed to load ${pluginName}: ${e.message}`);
      }
    }
    return loadedAny;
  }

  async _loadFile(path, name, builtin) {
    try {
      await import(path);
      this._loaded.push({ path, name, builtin, loaded: true });
    } catch (e) {
      this._loaded.push({ path, name, builtin, loaded: false, error: e.message });
      console.error(`[jsplugin] failed to load ${name}: ${e.message}`);
    }
  }

  list() { return this._loaded; }
}

// ── Selection helpers (used by micro.getSelection / micro.putSelection) ──────

function _selBounds(sel) {
  const a = sel.start, b = sel.end;
  const first = (a.y < b.y || (a.y === b.y && a.x <= b.x)) ? a : b;
  const last  = first === a ? b : a;
  return { first, last };
}

function _selText(buf, sel) {
  const { first, last } = _selBounds(sel);
  if (first.y === last.y) return buf.lines[first.y]?.slice(first.x, last.x) ?? "";
  const parts = [buf.lines[first.y]?.slice(first.x) ?? ""];
  for (let i = first.y + 1; i < last.y; i++) parts.push(buf.lines[i] ?? "");
  parts.push(buf.lines[last.y]?.slice(0, last.x) ?? "");
  return parts.join("\n");
}

function _deleteSel(buf, pane) {
  const sel = pane.selection;
  if (!sel) return;
  const { first, last } = _selBounds(sel);
  if (first.y === last.y) {
    buf.lines[first.y] = (buf.lines[first.y] ?? "").slice(0, first.x) + (buf.lines[first.y] ?? "").slice(last.x);
  } else {
    const a = (buf.lines[first.y] ?? "").slice(0, first.x);
    const b = (buf.lines[last.y]  ?? "").slice(last.x);
    buf.lines.splice(first.y, last.y - first.y + 1, a + b);
  }
  buf.invalidateHighlightFrom?.(first.y, { force: first.y !== last.y });
  buf.cursor = { x: first.x, y: first.y };
  pane.selection = null;
  buf.modified = true;
  buf.ensureCursor?.();
}

// ── mdcui block selector ────────────────────────────────────────────────────

function _parseBlockIdentity(input, { selector = false } = {}) {
  const text = String(input ?? "").trim();
  const match = text.match(/^([A-Za-z_][\w:-]*)?(?:#([A-Za-z_][\w:-]*))?((?:\.[A-Za-z_][\w:-]*)*)$/);
  if (!match || (!match[1] && !match[2] && !match[3])) return null;
  if (!selector && !match[1]) return null;
  return {
    tag: match[1] || null,
    id: match[2] || null,
    classes: match[3] ? match[3].slice(1).split(".") : [],
  };
}

function _blockHeader(line) {
  const text = String(line ?? "");
  const framed = text.match(/^(\s*)(?:┌─|╭─|\+-)\s*(\S+)\s*$/);
  if (framed) {
    const identity = _parseBlockIdentity(framed[2]);
    return identity ? { kind: "framed", indent: framed[1], ...identity } : null;
  }

  const fenced = text.match(/^(\s*)(`{3,})\s*(\S+)\s*$/);
  if (fenced) {
    const identity = _parseBlockIdentity(fenced[3]);
    return identity
      ? { kind: "fenced", indent: fenced[1], fenceLength: fenced[2].length, ...identity }
      : null;
  }

  return null;
}

function _matchesBlock(header, selector) {
  if (selector.tag && header.tag !== selector.tag) return false;
  if (selector.id && header.id !== selector.id) return false;
  return selector.classes.every((name) => header.classes.includes(name));
}

function _blockValue(lines, selector) {
  for (let start = 0; start < lines.length; start++) {
    const header = _blockHeader(lines[start]);
    if (!header || !_matchesBlock(header, selector)) continue;

    const value = [];
    for (let y = start + 1; y < lines.length; y++) {
      const line = String(lines[y] ?? "");
      const rest = line.startsWith(header.indent)
        ? line.slice(header.indent.length)
        : line;

      if (header.kind === "fenced") {
        const closing = rest.match(/^(`{3,})\s*$/);
        if (closing && closing[1].length >= header.fenceLength)
          return value.join("\n");
        value.push(rest);
        continue;
      }

      if (/^(?:└─|╰─|\+-)\s*$/.test(rest)) return value.join("\n");
      const body = rest.match(/^(?:│|\|)(?: ?)(.*)$/);
      value.push(body ? body[1] : rest);
    }
    return value.join("\n");
  }
  return undefined;
}

export function createTuiSelector(getBuffer) {
  return function $(selector) {
    const parsedSelector = _parseBlockIdentity(selector, { selector: true });
    return {
      val() {
        if (!parsedSelector) return undefined;
        const buffer = getBuffer?.();
        if (!buffer) return undefined;
        const lines = Array.isArray(buffer.lines)
          ? buffer.lines
          : String(buffer).replace(/\r\n?/g, "\n").split("\n");
        return _blockValue(lines, parsedSelector);
      },
    };
  };
}

// ── micro global object ───────────────────────────────────────────────────────

export function buildMicroGlobal(jsManager) {
  const getApp = () => jsManager._app;
  const getCtx = () => jsManager._ctx;
  const $ = createTuiSelector(() => getApp()?.buffer);

  // Converts cmd args to a safe command string for handleCommand
  function buildCmdString(name, args) {
    if (args.length === 0) return String(name);
    const parts = args.map(a => {
      const s = String(a);
      return /[\s"'\\]/.test(s) || s === "" ? JSON.stringify(s) : s;
    });
    return `${name} ${parts.join(" ")}`;
  }

  const micro = {
    // ── Hook registration ──────────────────────────────────────────
    on(hookName, fn) {
      jsManager.on(hookName, fn);
    },

    // ── Current pane access ───────────────────────────────────────
    CurPane() {
      const app = getApp();
      return app?.buffer ? _makePaneAPI(app.buffer, app) : null;
    },

    // ── Option access ─────────────────────────────────────────────
    GetOption:   (name)        => getCtx()?.config?.getGlobalOption(name),
    SetOption:   (name, value) => getCtx()?.config?.setGlobalOptionNative(name, value),

    // ── Messaging ─────────────────────────────────────────────────
    Log:         (...args) => console.log(...args),
    TermMessage: (msg) => { const app = getApp(); if (app) { app.message = String(msg); if (app._started) app.render?.(); } },
    alert: async (msg) => { const app = getApp(); if (app) await app.runAlert(msg); else console.log(String(msg)); },

    // ── Buffer line access (1-based line numbers; omit → cursor line) ─

    // Returns text of line n (1-based). Omit n to use cursor line.
    getLine(lineNumber) {
      const app = getApp();
      if (!app?.buffer) return "";
      const buf = app.buffer;
      const y = lineNumber != null ? Number(lineNumber) - 1 : buf.cursor.y;
      return buf.lines[y] ?? "";
    },

    // Replaces line n (1-based) with text. Text may contain newlines → line expands.
    putLine(text, lineNumber) {
      const app = getApp();
      if (!app?.buffer) return;
      const buf = app.buffer;
      const y = lineNumber != null ? Number(lineNumber) - 1 : buf.cursor.y;
      if (y < 0 || y >= buf.lines.length) return;
      buf.pushUndo?.();
      const parts = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      buf.lines.splice(y, 1, ...parts);
      buf.invalidateHighlightFrom?.(y, { force: parts.length > 1 });
      buf.modified = true;
      buf.ensureCursor?.();
      app.render?.();
    },

    // Deletes line n (1-based). If the buffer has only one line, clears it instead.
    delLine(lineNumber) {
      const app = getApp();
      if (!app?.buffer) return;
      const buf = app.buffer;
      const y = lineNumber != null ? Number(lineNumber) - 1 : buf.cursor.y;
      if (y < 0 || y >= buf.lines.length) return;
      buf.pushUndo?.();
      if (buf.lines.length === 1) {
        buf.lines[0] = "";
      } else {
        buf.lines.splice(y, 1);
      }
      buf.invalidateHighlightFrom?.(y, { force: true });
      buf.modified = true;
      buf.ensureCursor?.();
      app.render?.();
    },

    // Returns an array of line strings from line `from` to `to` (1-based, inclusive).
    // Omit both to return all lines.
    getLines(from, to) {
      const app = getApp();
      if (!app?.buffer) return [];
      const buf = app.buffer;
      const start = from != null ? Number(from) - 1 : 0;
      const end   = to   != null ? Number(to)   - 1 : buf.lines.length - 1;
      return buf.lines.slice(Math.max(0, start), Math.min(buf.lines.length, end + 1));
    },

    // Returns total number of lines.
    getLinesCount() {
      const app = getApp();
      return app?.buffer?.lines.length ?? 0;
    },

    // Returns the entire buffer content as a single string (lines joined by "\n").
    getAllText() {
      const app = getApp();
      return app?.buffer?.lines.join("\n") ?? "";
    },

    // Replaces the entire buffer content with text (may contain newlines).
    putAllText(text) {
      const app = getApp();
      if (!app?.buffer) return;
      const buf = app.buffer;
      buf.pushUndo?.();
      buf.lines = String(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
      if (buf.lines.length === 0) buf.lines = [""];
      buf.invalidateHighlightFrom?.(0, { force: true });
      buf.modified = true;
      buf.ensureCursor?.();
      app.render?.();
    },

    // ── Selection access ──────────────────────────────────────────────

    // Returns the currently selected text, or "" if nothing is selected.
    getSelection() {
      const app = getApp();
      if (!app?.buffer || !app.pane?.selection) return "";
      return _selText(app.buffer, app.pane.selection);
    },

    // Replaces the active selection with text; if nothing selected, inserts at cursor.
    putSelection(text) {
      const app = getApp();
      if (!app?.buffer) return;
      const buf = app.buffer;
      buf.pushUndo?.();
      if (app.pane?.selection) _deleteSel(buf, app.pane);
      buf.insert(String(text));
      app.render?.();
    },

    // ── Register custom command (shows up in Ctrl+E Tab completion) ──
    MakeCommand(name, fn) {
      if (!name || typeof fn !== "function") return;
      jsManager.commands.set(String(name), fn);
    },

    // ── cmd proxy: micro.cmd.save("file.txt") ─────────────────────
    // Each property is a function that calls handleCommand on the current pane.
    cmd: new Proxy({}, {
      get(_, name) {
        if (typeof name !== "string") return undefined;
        return async (...args) => {
          const app = getApp();
          if (!app) return;
          const result = await app.handleCommand(buildCmdString(name, args));
          app.render?.();
          return result;
        };
      },
    }),

    // ── action proxy: micro.action.MoveLinesUp() ──────────────────
    // Each property is an async function that runs a named editor action.
    // micro.shell.COMMAND(...args) — runs COMMAND with args via Ctrl-B interactive shell
    // e.g. micro.shell.ls('-l')  →  runInteractiveShell("ls -l")
    shell: new Proxy({}, {
      get(_, cmd) {
        if (typeof cmd !== "string") return undefined;
        return (...args) => {
          const app = getApp();
          if (!app?.runInteractiveShell) return;
          return app.runInteractiveShell([cmd, ...args.map(String)]);
        };
      },
    }),

    action: new Proxy({}, {
      get(_, name) {
        if (typeof name !== "string") return undefined;
        return async (...args) => {
          const app = getApp();
          if (!app) return;
          const fn = ACTIONS.get(name);
          if (fn) {
            await fn(app, ...args);
          } else {
            // Fallback: try as a method on the current buffer
            const buf = app.buffer;
            if (buf && typeof buf[name] === "function") {
              await buf[name](...args);
            } else {
              console.warn(`[micro.action] unknown action: ${name}`);
              return;
            }
          }
          app.render?.();
        };
      },
    }),

    // ── Runtime info ──────────────────────────────────────────────
    OS:      process.platform,
    Version: "0.1.0-bun",

    // ── Internal: register an action from a JS plugin ─────────────
    RegisterAction(name, fn) {
      ACTIONS.set(name, fn);
    },

    // ── Trigger editor re-render ──────────────────────────────────
    render() {
      getApp()?.render?.();
    },

    // ── Append to lintLog (displayed via :lintlog command) ────────
    pushLintLog(msg) {
      const plugins = getCtx()?.plugins;
      if (plugins) { plugins.lintLog ??= []; plugins.lintLog.push(String(msg)); }
    },

    // ── Buffer message factories ──────────────────────────────────
    // micro.buffer.newMessage(owner, msg, {x,y}, {x,y}, severity)
    // micro.buffer.newMessageAtLine(owner, msg, lineNum, severity)
    // micro.buffer.MTError / MTWarning / MTInfo
    // micro.buffer.Loc(x, y)
    buffer: {
      newMessage,
      newMessageAtLine,
      Loc: (x, y) => new Loc(x, y),
      MTError,
      MTWarning,
      MTInfo,
    },
  };

  globalThis.micro = micro;
  globalThis.$ = $;
  return micro;
}

// ── Pane / Buffer API returned by CurPane() ──────────────────────────────────

function _makePaneAPI(buffer, app) {
  return {
    get Buf()    { return _makeBufAPI(buffer); },
    get Cursor() { return _makeCursorAPI(buffer); },
    CursorLocation: () => app?.formatCursorLocation?.(buffer) ?? "+1.0:1",
    AbsoluteCursorLocation: () => app?.formatAbsoluteCursorLocation?.(buffer) ?? "+1:1",

    Save:        async () => app?.save?.(),
    Quit:        async () => app?.quit?.(),
    Backspace:   () => buffer.backspace(),
    Delete:      () => buffer.deleteForward(),
    CursorLeft:  () => buffer.moveLeft(),
    CursorRight: () => buffer.moveRight(),
    CursorUp:    () => buffer.moveUp(),
    CursorDown:  () => buffer.moveDown(),
    StartOfLine: () => buffer.moveHome(),
    EndOfLine:   () => buffer.moveEnd(),
    InsertNewline: () => buffer.newline(),
    InsertTab:   () => buffer.insertTab(),
    Insert:      (text) => { buffer.pushUndo?.(); buffer.insert(text); app?.render?.(); },
    HandleCommand: (cmd) => app?.handleCommand?.(cmd),

    // Run a named action on this pane
    RunAction: async (name, ...args) => {
      const fn = ACTIONS.get(name);
      if (fn) { await fn(app, ...args); app.render?.(); }
    },
  };
}

function _makeBufAPI(buffer) {
  return {
    get Path()     { return buffer.path ?? ""; },
    get AbsPath()  { return buffer.AbsPath ?? buffer.path ?? ""; },
    get Type()     { return buffer.Type; },
    get Settings() { return buffer.Settings; },
    get Modified() { return buffer.modified; },

    Line:      (n) => buffer.Line(n),
    LinesNum:  ()  => buffer.LinesNum(),
    FileType:  ()  => buffer.FileType(),
    SetOption: (opt, val) => buffer.SetOption(opt, val),
    Insert:    (loc, text) => buffer.Insert(loc, text),
    GetActiveCursor: () => _makeCursorAPI(buffer),
  };
}

function _makeCursorAPI(buffer) {
  return {
    get X() { return buffer.cursor.x; },
    set X(v) { buffer.cursor.x = v; buffer.ensureCursor?.(); },
    get Y() { return buffer.cursor.y; },
    set Y(v) { buffer.cursor.y = v; buffer.ensureCursor?.(); },
  };
}
