# Changelog

All notable user-visible changes to jsmdcui are documented here.

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
