# Changelog

All notable user-visible changes to jsmdcui are documented here.

## [0.7.0] - 2026-07-20

This update adds native Kitty image rendering, turns heading task lists into
Array-style collections in both interfaces, and keeps TUI layout, interaction,
and checkbox styling consistent at every terminal width.

### Added

- Display local Markdown images at their rendered TUI positions with the
  Kitty graphics protocol. Image rows are reserved according to intrinsic
  dimensions, and placements follow scrolling, resizing, and split panes.
- With `--allow-url` and Kitty mode enabled, download HTTP(S) Markdown images
  through the existing `curl`, `wget`, then Bun `fetch` fallback chain. Relative
  image URLs in downloaded Markdown resolve against the original document URL.
- Keep Bun's normal linked `📷` fallback for missing, unsupported, and
  unauthorized remote images, and scope Kitty cleanup to image IDs owned by
  jsmdcui.
- Set Kitty's `C=1` placement flag so displaying an image cannot advance the
  terminal cursor and trigger an unwanted scroll at the bottom of the screen.
- Add `.push()`, `.pop()`, `.shift()`, `.unshift()`, and `.splice()` to heading
  selectors in both the TUI and WUI. The methods follow their
  `Array.prototype` argument and return-value conventions, operate on direct
  items in the first task list belonging to the heading, and remove nested
  content together with its parent item.
- Allow inserted task items to be passed as strings for unchecked items or as
  `{ value, checked }` objects, and preserve an emptied TUI list's insertion
  point so later mutations still target the same list.
- Add read-only heading `.slice(start, end)`, returning fresh
  `{ value, checked }` snapshots that include both checked and unchecked direct
  task items.
- Add `demos/todo.md` and `demos/todo-zh.md`, runnable Todo examples that use
  text controls and the new list methods to add and remove items and display
  completed or pending tasks.
- Move secondary examples under `demos/` and add automatic
  `--demo-<filename>` discovery, so newly bundled `demos/<filename>.md` files
  need no parser changes. Keep `--demo` mapped to the root `testapp.md` and
  retain the existing image-processor aliases.
- Add `--demo-list` to list the root demo and every automatically discovered
  Markdown example from bundled assets or the source tree's `demos/` directory.
- Add `clean.sh` as a convenience helper for removing generated Markdown
  companion files from the project directory.

### Changed

- Document the Array-style heading task-list API, its return values, nested-item
  behavior, existing-list requirement, and non-persistent rendered-state
  semantics in the README and bundled help.
- Use the complete pane content width consistently for Markdown rendering,
  soft wrapping, cursor and mouse mapping, and Kitty image sizing instead of
  reserving the terminal's final column.

### Fixed

- Fix soft wrapping at affected terminal widths shifting the visual cursor by
  one row, which could activate the preceding Markdown action and leave the
  final action unresponsive.
- Update the Bun Markdown ANSI glyph and style together when toggling a task
  checkbox, so checked items become green and unchecked items no longer retain
  the checked color.

## [0.6.3] - 2026-07-18

This update enforces unique heading IDs at the Markdown source level and
clarifies the portable fenced-block identity contract shared by the TUI and
WUI.

### Changed

- Treat duplicate Markdown headings that generate the same base ID as a
  source-level collision. Later headings no longer pass `--check` merely
  because Bun would silently assign generated suffixes such as `-1` or `-2`
  that the Markdown author cannot see.
- Document that a selectable fenced-block declaration requires a tag and uses
  the `tag#id.class` identity form. The officially supported portable control
  tags are currently limited to `text` and `textarea` so the same Markdown
  behaves consistently in both the TUI and WUI.
- Clarify that selector queries may omit the tag or classes after a valid
  declaration.
- Expand checker and TUI selector regression coverage across tag/no-tag and
  class/no-class combinations, heading-to-heading, heading-to-block, and
  block-to-block ID collisions.

### Fixed

- Fix duplicate source headings incorrectly passing the checker after Bun
  automatically changed the generated ID of later headings.

## [0.6.2] - 2026-07-18

This update makes Markdown ID-collision checks match the full TUI `$()` block
selector and gives check results clearer final status banners.

### Changed

- Extend `--check FILE.md` from `text` and `textarea` controls to every
  explicitly named fenced block accepted by the TUI `$()` selector, including
  identities such as `hello#myid` and `json#config`.
- Report separate heading and fenced-block declaration counts, and describe
  arbitrary block tags and their source lines in collision details.
- Replace the previous success label with a large green `PASSED` banner and
  add a matching large red `FAILED` banner at the bottom of failed reports.
  Both true-color foregrounds are generated with
  `Bun.color(..., "ansi-16m")`, with standard ANSI fallbacks.
- Update the README and bundled help to clarify that generated heading IDs
  share the selector namespace with all explicitly named fenced blocks, not
  only editable text controls.

### Fixed

- Fix `--check` overlooking collisions between a heading and a non-text
  fenced block even though TUI `$().val()` could select both declarations.
- Add regression coverage for arbitrary fenced-block IDs and the colored
  `PASSED` and `FAILED` terminal statuses.

## [0.6.1] - 2026-07-18

This update adds Markdown UI ID-collision diagnostics and bundles a practical
Bun.Image processor demo in English and Traditional Chinese.

### Added

- Add `--check FILE.md` to inspect Markdown heading and text-control IDs
  without opening a UI or writing generated companion files. The report uses
  `Bun.markdown.ansi()` headings and nested lists, identifies every collision
  by ID, source type, line number, and original declaration, and exits with
  status `0` for unique IDs, `1` for collisions, or `2` for usage and read
  errors.
- Add `image-processor.md` and `image-processor.zh-TW.md`, runnable Bun.Image
  tools for the TUI and WUI. They support image metadata inspection, resizing,
  fit and resampling filters, enlargement prevention, EXIF auto-orientation,
  rotation, vertical and horizontal mirroring, brightness and saturation
  adjustment, and JPEG or PNG output options.
- Add detailed image-processing status fields. Successful writes show the
  output path, dimensions, byte count, and all selected option values; failed
  metadata reads and writes show the available error details and stack.
- Add `--demo-imgtool` and `--demo-imgtool-zh`. Each command preserves an
  existing local processor Markdown file or writes its bundled language
  version when missing, then opens it in the TUI.
- Bundle both image processor Markdown files in the single-executable asset
  archive and add regression coverage for ID checks and both demo languages.

### Changed

- Consolidate bundled demo Markdown loading behind one
  `bundledMarkdownSource(filename)` implementation shared by `testapp.md`,
  `select.md`, and both image processor variants.
- Document that heading selector values include the complete visible label.
  Selection parsers should use deliberate substring, prefix, or token checks
  when labels contain explanatory text instead of assuming exact identifiers.
- Document that generated heading IDs and explicitly named controls share the
  same selector namespace and that every selectable ID should be unique.

### Fixed

- Prevent explanatory text in image processor task-list labels from breaking
  yes/no, fit, filter, and output-format selection parsing.
- Fix the English image processor status update silently targeting a heading
  after `## Write Status` generated the same `#write-status` ID as its text
  control.
- Catch image metadata and processing failures at both frontend and backend
  boundaries so errors are displayed in the appropriate status field.

## [0.6.0] - 2026-07-18

This update turns Markdown headings and task lists into cross-environment form
controls, improves the safety and consistency of the bundled demo workflow,
and adds a way to export the bundled README as a runnable Markdown app.

### Added

- Add `--export-readme` to write or overwrite `./README.md` with the bundled
  README source and exit.
- Add terminal task-checkbox activation. Activating a protected mdcui row at
  or after its `☐` or `☒` toggles that checkbox and still allows the remaining
  default cell callback to run. JavaScript links continue to take priority.
- Add hierarchical `<section>` wrappers to generated WUI HTML. Every h1-h6
  opens a section; an equal or higher-level heading closes the applicable open
  sections, while lower-level headings create nested sections. Content before
  the first heading remains outside the generated sections.
- Add heading lookup to the TUI `$` API using the IDs generated by
  `Bun.markdown.html(..., { headings: { ids: true } })`.
- Add `$('#heading-id').html()` in TUI to return a heading's inner HTML, and
  `$('#heading-id').line()` to return its current 1-based terminal row or `0`
  when it cannot be found. Line lookup follows text-block row additions,
  removals, and multiline `.val(value)` replacements.
- Add `.html()` getters to WUI `$` selections. Any successfully selected DOM
  element returns its `innerHTML`; missing or invalid selections return an
  empty string.
- Add heading-based task-list values in both interfaces. `.val()` reads the
  first task-list group directly following the selected heading, stops at the
  next heading, and ignores nested task items. IDs beginning with `select`
  return the first checked value or `null`; other IDs return all checked values
  as an array or `[]`.
- Add `select.md`, a runnable multilevel heading and task-list example with
  links that display single-select and multiple-select values through
  `alert()`.
- Bundle `select.md` in packaged assets and add `--demo-select`. The command
  preserves an existing `./select.md`, writes the bundled copy when missing,
  opens it in the TUI, and generates its five companion files.

### Changed

- Make `--demo` preserve an existing `./testapp.md`. The bundled source is now
  written only when the file is missing, then opened in the terminal UI.
- Make `--wui` without a file follow the same source-file rule: use an existing
  `./testapp.md`, or write the bundled demo there when missing, before creating
  the generated companion files.
- Wrap generated WUI task-checkbox text in `<label>` so clicking the associated
  text toggles the checkbox. Direct text and immediately following paragraph
  elements are included; unrelated tags and nested lists remain outside.
- Extend the 0.5 `$().val()` contract: text and textarea controls retain their
  string getter/setter behavior, while heading selections now return scalar,
  array, or `null` task-list values according to the heading ID.
- Add a demo screenshot and expand the README and built-in help with clearer
  TUI/WUI startup, demo preservation, and README export instructions.

### Fixed

- Ensure WUI fallback to the bundled `testapp.md` materializes the Markdown
  source in the current working directory instead of generating only its
  companion files.
- Protect comments and `script`, `style`, `pre`, `code`, `textarea`, and
  `template` regions while wrapping WUI headings, preventing heading-like HTML
  strings inside those regions from changing the section hierarchy.
- Keep TUI heading lookup independent of ANSI heading text and duplicate
  labels by mapping Bun-generated heading order and level to Bun's current
  h1-h6 ANSI signatures.

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
