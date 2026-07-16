# Changelog

All notable user-visible changes to jsmdcui are documented here.

## [0.5.0] - 2026-07-16

This update adds cross-environment form-like text blocks and a small
jQuery-style selector API, while keeping the same Markdown source usable in
both the terminal and browser interfaces.

### Added

- Add a minimal global `$` API to terminal frontend evaluation, JavaScript
  plugins, generated browser frontend modules, and `javascript:` links.
- Support tag, ID, class, and combined selectors such as `$('text')`,
  `$('#answer')`, `$('.field')`, and `$('text#answer.field')`.
- Add `.val()` and `.val(value)` for reading and replacing block contents.
  Getters always return a string and use an empty string for missing elements,
  invalid selectors, or lookup errors. Setters support chaining and resize
  terminal blocks to fit multiline values.
- Recognize both raw Markdown fenced blocks and rendered Bun ANSI blocks,
  including ASCII and Unicode frame characters.
- Add editable terminal `text` blocks. Content after the protected `│ ` or
  `| ` prefix can be edited, while frame characters, line joins, inserted
  newlines, and multiline pastes remain protected.
- Add interactive terminal text-block resizing. Activating the lower-left
  frame corner adds an empty content row; activating the upper-left corner
  removes only a trailing empty row and never deletes non-empty content.
- Add the optional frontend lifecycle callback
  `onMdcuiExit({ reason, path, $ })`. The terminal awaits it before closing an
  mdcui buffer and invokes it at most once per buffer.
- Add Markdown syntax completions for fenced block language identifiers.

### Changed

- Convert `text` and `textarea` fenced blocks into native browser
  `<textarea>` elements while preserving their ID, classes, original language
  metadata, and selector compatibility.
- Prefer native `document.querySelector()` in the browser `$` implementation,
  then fall back to mdcui metadata and the original `pre > code` structure.
- Automatically wrap and resize generated browser textareas on page load,
  input, `.val(value)`, and window resize. Initial `rows` and `cols` are
  derived from the Markdown content.
- Generate complete HTML5 documents for WUI output, including `<!doctype
  html>`, UTF-8 metadata, a responsive viewport, a document title, and
  `lang="zh-TW"`.
- Enable `softwrap` by default.
- Close modified mdcui buffers without displaying a save prompt. Applications
  can use `onMdcuiExit` to collect edited field values or call backend RPC
  functions before closing.
- Update the bundled example with editable text fields, selector API examples,
  answer validation, and manual text-box resizing instructions.

### Fixed

- Keep terminal text-block frame prefixes intact during editing and prevent
  Delete at the end of a content row from merging it with the next row.
- Preserve browser textarea IDs and classes during Markdown-to-HTML
  conversion, including compatibility metadata for original `text` selectors.
- Keep README and built-in help lifecycle documentation synchronized.

## [0.4.0] - 2026-07-16

This release separates executable Markdown UI views from ordinary editable
buffers, makes encoding behavior predictable across opens, tabs, splits, and
reopens, and adds explicit demo and trusted-remote execution modes.

### Added

- Add `--demo`. It outputs and overwrites `./testapp.md`, opens it as a terminal
  Markdown UI, and writes the five generated companion files beside it.
- Add `--allow-url` for trusted remote Markdown apps. It downloads an HTTP(S)
  resource into the current directory, opens the downloaded copy through the
  normal local Markdown UI pipeline, writes the five generated companion files,
  and permits its embedded frontend and backend code to run.
- Add regression coverage for global encoding handling, mdcui backup isolation,
  the bundled demo workflow, implicit Markdown rendering, and explicit UTF-8
  editing.

### Changed

- Treat `mdcui` buffers as independent, derived, read-only views. Every mdcui
  open creates a new buffer instead of entering the same-path editable-buffer
  cache.
- Continue sharing ordinary buffers opened from the same absolute path.
  UTF-8 and other non-mdcui views share content, modification state, saves, and
  reopens.
- Re-evaluate buffer sharing after `reopen`:
  - reopening an mdcui view as a normal encoding joins an existing same-path
    editable buffer, or registers itself when no such buffer exists;
  - reopening a shared editable view as mdcui detaches only the current pane
    into a new mdcui buffer and leaves the other shared panes unchanged.
- Make interactive `open`, `tab`, `vsplit`, and `hsplit` operations perform
  fresh `.md` automatic detection for files that are not already represented
  by a normal cached buffer.
- Ignore a top-level global `encoding` value read from `settings.json`.
  Encoding is selected per invocation or buffer; command-line encoding options
  remain effective for the current run and are not persisted.
- Organize `--testapp.md` and `--demo` under a dedicated `Demo` section in
  `--help`, and document commands that overwrite source or generated files.

### Fixed

- Fix `.md` files opened from inside the editor failing to enter mdcui mode.
- Fix encoding changes leaking between independent mdcui tabs.
- Fix `reopen mdcui` mutating every pane that shared the original editable
  buffer.
- Fix mdcui-to-UTF-8 reopens remaining outside the normal same-path buffer
  cache.
- Delay applying an explicit reopen encoding until the reopen is confirmed, so
  canceling the save prompt does not alter the shared buffer.

### Security

- Exclude mdcui buffers completely from crash-recovery backups: they do not
  create, apply, prompt for, or remove backups. This prevents a derived
  read-only view from consuming or deleting a backup belonging to an editable
  view of the same Markdown source.
- Remote HTTP(S) Markdown remains non-executable and does not write companion
  files by default.
- `--allow-url` is an explicit trust boundary. It writes downloaded content and
  generated JavaScript/HTML files into the current directory, may overwrite
  files with the same names, and runs code from the remote document with the
  permissions of the jsmdcui process. Use it only with trusted URLs and in a
  directory where those writes are safe.

## [0.3.1] - 2026-07-16

### Added

- Add `--edit` to open Markdown files as editable UTF-8 source instead of
  automatically entering mdcui mode.
- Add `--cat` regression coverage for implicit mdcui rendering and explicit
  UTF-8 overrides.

### Fixed

- Prevent an explicit encoding choice from being replaced by automatic mdcui
  detection.
- Correct terminal raw-mode handling around log and prompt output.

## [0.3.0] - 2026-07-16

Initial usable release, based on the bunmicro terminal editor.

### Added

- Open local Markdown files as interactive, read-only terminal interfaces while
  retaining navigation, selection, search, copy, mouse support, and automatic
  reflow when the terminal is resized.
- Open HTTP(S) Markdown files in the terminal without generating local
  companion files or executing their `javascript:` links.
- Start a browser interface with `--wui [FILE.md]`. Browser pages support normal
  links, clickable `javascript:` actions, heading anchors, and task checkboxes
  that can be toggled for the current page session.
- Build interactive Markdown apps with `js front`, `js back`, and
  `javascript:` links. Frontend actions can use `alert`, `confirm`, `prompt`,
  and call published backend functions through `rpc`.
- Activate local terminal actions with `Enter`, `Space`, or a left click, with
  visible reporting for synchronous and asynchronous frontend errors.
- Generate five companion files beside each local Markdown source:
  `.front.js`, `.back.js`, `.html`, `-rpc.js`, and `-server.js`.
- Print terminal output with `--cat`, print the bundled example source with
  `--testapp.md`, and choose a WUI port with the `PORT` environment variable.
- Provide the `jsmdcui`, `tui`, and `wui` launchers, Bun scripts for common
  development tasks, bundled runtime assets, and experimental single-executable
  build commands.
- Retain the normal bunmicro-based editor for non-Markdown buffers, including
  file editing, syntax highlighting, search and replace, undo and redo, tabs,
  split panes, clipboard support, themes, and shell commands.
- Show this README as the built-in `Ctrl-G` help page.

### Changed

- Local `.md` files now enter read-only Markdown UI mode automatically. Starting
  jsmdcui without a file still opens the normal terminal editor.
- Opening or rendering a local Markdown file regenerates its five companion
  files in terminal, `--cat`, and `--wui` modes.
- Running `--wui` without a file uses `testapp.md` in the current directory when
  present, otherwise the bundled demo, and writes generated files in the current
  directory.
- Every WUI start prints a fresh UUID-based page URL. Requests without the
  trailing slash redirect to the canonical page URL.
- `js front` and `js back` blocks are removed from the displayed Markdown and
  written to their generated modules.

### Fixed

- Preserved Markdown ANSI colors in the terminal UI and prevented the rendered
  document background from obscuring the editor theme.
- Correctly detected links at the active terminal cell and loaded the matching
  generated frontend module.
- Restored terminal display state after `alert`, `confirm`, and `prompt`.
- Reported frontend errors instead of letting them crash or silently fail.
- Corrected generated module paths and imports, supported bundled runtime
  templates, and removed redundant file generation.
- Made JavaScript plugin commands available through command lookup and
  completion, and added `js`, `py`, and `sh` choices for `eval` completion.

### Security

- Browser RPC discovery and calls expose only exported backend functions whose
  exported names do not begin with `_`. This restriction applies to WUI RPC;
  the local TUI imports the backend module directly.
- WUI pages use a fresh UUID path on each start. This reduces accidental
  discovery but is not authentication or authorization.
- The WUI has no login or HTTPS, may be reachable through the machine's network
  interfaces, and permits cross-origin RPC responses. Anyone who can reach it
  and obtains the complete URL can call every backend function published by the
  Markdown app.
- Frontend code runs in the browser, while terminal frontend code and backend
  code can run with the permissions of the jsmdcui process. Only open or serve
  Markdown apps from trusted sources.
