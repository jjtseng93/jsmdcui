![Demo](https://raw.githubusercontent.com/jjtseng93/jsmdcui/main/demo.jpg)

# Demo App
## My app

- [Say hello](javascript:sayHello())
- [Get server time](javascript:showServerTime())
- [Update text box](javascript:updateText())
- [Show selected](javascript:alert(JSON.stringify($('#my-app').val())))
- [x] task1
- [x] task2
- [ ] unselected task

```text#myid.myclass
Editable in both TUI and WUI
```

# Introduction
- jsmdcui stands for:
- JavaScript Markdown Cross-environment User Interface
- The goal is to use Markdown as a Common UI for Terminals and Web Browsers
  * TUI = Terminal User Interface
  * WUI = Web User Interface
- .
- It's based on bunmicro, a terminal text editor derived from the Micro text editor

- Original projects:
- https://github.com/jjtseng93/bunmicro
- https://github.com/micro-editor/micro
- .
- This README is itself a runnable app.

```sh
npx jsmdcui@latest README.md
```

## Quick start

jsmdcui requires [Bun](https://bun.com). On Android, install it in Termux:

```sh
npm install -g bun
```

On other platforms, follow the [official Bun installation guide](https://bun.com/docs/installation).

Choose either of these two ways to run jsmdcui.

> **Important:** Opening or rendering a local `.md` file writes or overwrites
> 5 generated files beside it. Starting `--wui` without a file writes the
> 5 files generated from `testapp.md` in the current directory. The source
> Markdown is not changed, but you should run the demo in a directory where
> overwriting generated files is safe.

### Route 1: Run with npx

- This route requires both `npx` and `bun` on your `PATH`; no source checkout is
required. 

#### Open the normal terminal editor

```sh
npx jsmdcui
```

#### Start `testapp.md` as the TUI/WUI demo
- If `testapp.md` is missing, the bundled copy is written to the current working directory
- If `testapp.md` already exists, it will be used and won't be overwritten.

```sh
# TUI(Terminal User Interface) Demo
npx jsmdcui --demo
```

```sh
# Heading and task-list selector demo
npx jsmdcui --demo-select
```

```sh
# Bun.Image processor demo
npx jsmdcui --demo-imgtool
```

```sh
# Traditional Chinese Bun.Image processor demo
npx jsmdcui --demo-imgtool-zh
```

```sh
# WUI(Web User Interface) Demo
npx jsmdcui --wui
```

#### Open your own Markdown CUI App

```sh
npx jsmdcui app.md
npx jsmdcui --wui app.md
```

### Route 2: Clone the source

```sh
git clone https://github.com/jjtseng93/jsmdcui.git
cd jsmdcui
bun src/index.js testapp.md
```

- The last command opens the included demo in the terminal
- Use arrow keys to move around
- `Enter`, `Space`, or mouse click to activate an item, and `Ctrl-Q` to quit.
- To open the same demo in a browser instead:

```sh
bun src/index.js --wui testapp.md
```

- After starting `--wui`, open the last printed `http://...` URL in a browser.
- Keep the command running while using the CUI App, and press `Ctrl-C` in that terminal to stop the server.

### Usage table

- The command table below assumes you're running from a cloned repository 
- If you use npx, replace `bun src/index.js` with `npx jsmdcui`

- I've also provided short aliases
  * bun ./tui = bun src/index.js
  * bun ./wui = bun src/index.js --wui

| Command | Result |
| --- | --- |
| `bun src/index.js app.md` | Render `app.md` as a read-only terminal UI and write five generated files beside it. |
| `bun src/index.js --kitty app.md` | Display Markdown images with Kitty graphics and the jsgotty MIME extension. |
| `bun src/index.js --kitty-compat app.md` | Display Markdown images with Kitty graphics without the non-standard MIME `U` field. |
| `bun src/index.js --kitty --allow-url URL.md` | Download trusted HTTP(S) Markdown and its HTTP(S) images, then display supported images with Kitty graphics. |
| `JSMDCUI_KITTY_DEBUG=1 bun src/index.js --kitty app.md` | Enable Kitty image placement logging to `kitty-placement.log`. |
| `bun src/index.js --check app.md` | Check heading and fenced-block IDs for collisions, print line-by-line details, and exit. |
| `bun src/index.js --edit app.md` | Open `app.md` as editable UTF-8 source, overriding automatic Markdown UI detection. |
| `bun src/index.js --cat app.md` | Render the terminal version to stdout, write five generated files beside it, and exit. |
| `bun src/index.js --testapp.md` | Write the bundled `testapp.md` source to stdout and exit. |
| `bun src/index.js --export-readme` | Write or overwrite `./README.md` with the bundled README source and exit. |
| `bun src/index.js --demo` | Use local `testapp.md` when present, otherwise write the bundled demo; open it in the terminal UI and write five generated files beside it. |
| `bun src/index.js --demo-select` | Use local `select.md` when present, otherwise write the bundled selector demo; open it in the terminal UI and write five generated files beside it. |
| `bun src/index.js --demo-imgtool` | Use local `image-processor.md` when present, otherwise write the bundled Bun.Image processor; open it in the terminal UI and write five generated files beside it. |
| `bun src/index.js --demo-imgtool-zh` | Use local `image-processor.zh-TW.md` when present, otherwise write the bundled Traditional Chinese Bun.Image processor; open it in the terminal UI and write five generated files beside it. |
| `bun src/index.js --allow-url URL.md` | Download HTTP(S) Markdown to the current directory and, with Kitty mode enabled, download its HTTP(S) images; write 5 generated files and allow embedded code to run. Only use trusted URLs. |
| `bun src/index.js --wui` | Use local `testapp.md` when present, otherwise write the bundled demo; write five generated files in the current directory, then print and serve a random URL. |
| `bun src/index.js --wui app.md` | Write five generated files beside `app.md`, then print and serve a random URL. |
| `PORT=8080 bun src/index.js --wui app.md` | Start the browser UI on another port. |
| `bun src/index.js` | Open the normal terminal editor with an empty buffer. |

Run `npx jsmdcui --help` or `bun src/index.js --help` for all command-line
options.

## Write a Markdown UI

Create `app.md`:

````md
## My app

- [Say hello](javascript:sayHello())
- [Get server time](javascript:showServerTime())
- [Update text box](javascript:updateText())
- [Show selected](javascript:alert(JSON.stringify($('#my-app').val())))
- [x] task1
- [x] task2
- [ ] unselected task

```text#myid.myclass
Editable in both TUI and WUI
```

```js front
export function sayHello() {
  const name = prompt("Your name:", "World");
  if (name) alert(`Hello, ${name}!`);
}

export async function showServerTime() {
  const time = await rpc.getServerTime();
  alert(time);
}

export function updateText() {
  $('#myid').val($('.myclass').val() + ' ✓');
}
```

```js back
export function getServerTime() {
  return new Date().toISOString();
}
```
````

Open it in either UI:

```sh
bun src/index.js app.md
bun src/index.js --wui app.md
```

- The resulting App UI is shown at the beginning of this README.md
- Run this demo app directly by:
  * bun src/index.js README.md
  * If you didn't clone the repo, use --export-readme to write README.md to the current folder

### Text blocks

Both `text` and `textarea` fenced blocks define editable text fields:

````md
```text#message.note
Initial value
```
````

A fenced-block declaration must include a tag. Its supported identity syntax is
`tag`, optionally followed by `#id` and one or more `.class` names, for
example `text#message.note` or `textarea#notes.readonly`. Tags, IDs, and class
names must begin with an ASCII letter or underscore; their remaining
characters may also include digits, `_`, `-`, and `:`. Declarations such as
`#message` and `#message.note` have no tag and are therefore not recognized as
selectable fenced blocks.

The currently supported fenced-block tags are only `text` and `textarea` so
the same control works consistently in both the TUI and WUI. Selector queries
may omit the tag or classes after a valid declaration, so all of
`$('text#message.note')`, `$('text#message')`, `$('#message.note')`, and
`$('#message')` can select the example above.

The same Markdown works in both interfaces. In the browser WUI it becomes a
native `<textarea>` with the declared ID and classes. Long text wraps
automatically, and the field height is recalculated when the user types, the
window is resized, or frontend code calls `.val(value)`.

In the terminal TUI, only content after the protected `│ ` or `| ` prefix can
be edited. The frame prefix cannot be deleted, Enter cannot insert a newline,
Delete at the end of a row cannot join the next row, and multiline paste is
blocked. Activate the lower-left frame corner to add a row. Activate the
upper-left frame corner to remove the trailing row only when it is empty;
non-empty content is never removed.

### Heading task lists and selector API

Headings can act as form-group selectors. jsmdcui uses the IDs generated by
`Bun.markdown.html(..., { headings: { ids: true } })`; for example,
`## Select Color` becomes `#select-color`. A heading selection reads direct
task items from the first list following that heading and stops at the next
heading. In the TUI, the first rendered `☐` or `☒` establishes that list and
its indentation. Nested task items are not included in the outer list's value.

Heading IDs share the same selector namespace as all explicitly named fenced
blocks, not only `text` and `textarea`, so avoid name collisions between them.
For example, `## Write Status` generates `#write-status` and must not be used
together with a block such as `text#write-status` or
`textarea#write-status`.
Otherwise, `$('#write-status')` may select the heading instead of the block and
updates can appear to do nothing. Rename either declaration so every
selectable ID is unique.

Duplicate source headings are also treated as collisions when they generate
the same base ID. Although Bun would automatically rename later headings with
suffixes such as `-1` and `-2`, those implicit selector names are not visible
in the Markdown source and should not be relied on. Give each heading a name
that produces a unique ID before rendering.

Run `bun src/index.js --check app.md` (or `jsmdcui --check app.md`) to
check these IDs without opening either UI or writing generated files. The
command prints each collision with its source type, line number, and original
declaration, then exits immediately. Its exit status is `0` when all IDs are
unique, `1` when collisions are found, and `2` for invalid arguments or read
errors.

If the heading ID begins with `select`, `.val()` behaves like a single select:
it returns the first checked item or `null`. Other heading IDs behave like a
multiple select and return all checked items as an array, or `[]` when none are
checked.

Heading values contain the complete visible label, including any explanatory
text. When interpreting a selection, prefer `value.includes(...)` (or another
deliberate prefix/token parser) unless labels are guaranteed to be exact,
stable identifiers. For example, `yes（flip vertically）` should not be tested
with `value === "yes"`.

````md
## Select Color

- [ ] Red
- [x] Green
- [ ] Blue

## Features

- [x] Search
- [ ] Notifications
- [x] Offline mode

```js front
export function showValues() {
  alert(JSON.stringify({
    color: $('#select-color').val(),
    features: $('#features').val(),
  }));
}
```
````

The same getter works in TUI and WUI:

```js
$('#select-color').val() // "Green"
$('#features').val()     // ["Search", "Offline mode"]
```

The first direct task list belonging to a heading can also be changed with
Array-style methods. String arguments create unchecked items. Pass an object
to choose the initial checked state:

```js
$('#features').push('Export')
$('#features').unshift({ value: 'Import', checked: true })
$('#features').splice(1, 2, 'Replacement')
$('#features').slice(0, 2)
$('#features').pop()
$('#features').shift()
```

Like the corresponding `Array.prototype` methods, `.push(...items)` and
`.unshift(...items)` accept multiple items and return the new number of direct
items. `.pop()` and `.shift()` return the removed item's visible label, or
`undefined` when the list is empty. Nested task items are part of their parent
item: they are not counted separately, and are removed together with that
parent. These methods change the rendered TUI/WUI state; they do not rewrite
the source Markdown file. A heading must already have a task list before items
can be added.

`.splice(start, deleteCount, ...items)` follows `Array.prototype.splice()`:
negative indexes count from the end, omitting `deleteCount` removes through the
end, and the return value is an array containing the removed visible labels.

`.slice(start, end)` is read-only and follows `Array.prototype.slice()`. It
returns fresh item snapshots, including unchecked items, so changing the
returned array or its objects does not change the rendered list:

```js
$('#features').slice()
// [
//   { value: 'Search', checked: true },
//   { value: 'Notifications', checked: false },
// ]
```

`todo-zh.md` is a runnable Todo example that demonstrates `.push()`,
`.splice()`, `.slice()`, and `{ value, checked }` snapshots using editable text
controls instead of `prompt()` dialogs. Open it in either interface:

```sh
bun src/index.js todo-zh.md
bun src/index.js --wui todo-zh.md
```

The bundled `select.md` is a multilevel runnable example. Use `--demo-select`
to write it into the current directory when missing and open it in the TUI, or
open it explicitly in either interface:

```sh
bun src/index.js --demo-select
bun src/index.js select.md
bun src/index.js --wui select.md
```

The available selector methods are:

| Method | TUI | WUI |
| --- | --- | --- |
| `.val()` | Read text blocks or heading task-list values. | Read textareas/controls or heading task-list values. |
| `.val(value)` | Replace text-block contents and resize multiline values. | Set textarea/control values and resize textareas. |
| `.html()` | Return a selected heading's inner HTML. | Return any successfully selected DOM element's `innerHTML`. |
| `.line()` | Return a heading's current 1-based TUI row, or `0` if missing. | Not available. |
| `.push(...items)` | Append unchecked strings or `{ value, checked }` task items; return the new direct-item count. | Same. |
| `.pop()` | Remove and return the last direct task item's label, or `undefined`. | Same. |
| `.shift()` | Remove and return the first direct task item's label, or `undefined`. | Same. |
| `.unshift(...items)` | Prepend unchecked strings or `{ value, checked }` task items; return the new direct-item count. | Same. |
| `.splice(start, deleteCount, ...items)` | Remove and insert direct task items; return the removed labels as an array. | Same. |
| `.slice(start, end)` | Return `{ value, checked }` snapshots without changing the direct task items. | Same. |

TUI heading rows are recalculated after text-block rows are added, removed, or
replaced with multiline `.val(value)` content.

The three UI building blocks are:

- Regular Markdown provides headings, text, lists, task checkboxes, code, and
  links.
- A `js front` block contains UI code. Exported functions can use
  `alert`, `confirm`, `prompt`, and the generated `rpc` client.
- A front module may export `async function onMdcuiExit({ reason, path, $ })`.
  The terminal UI awaits it before closing an `mdcui` buffer. Modified
  `mdcui` buffers close without a save prompt.
- A `js back` block exports trusted backend functions. In the browser WUI,
  `rpc` publishes only exported functions whose exported names do not start
  with `_`. Call a published function from the front end with
  `await rpc.functionName(arg1, arg2)`.

> An `_` prefix only hides a function from the browser WUI RPC interface. The
> local terminal UI imports the backend module directly, so `_` is a naming
> convention, not authentication or a security boundary. Use a name without
> `_` for a function that must work through RPC in both UIs.

Use a `javascript:` Markdown link to run front-end code:

```md
[Button label](javascript:exportedFunction())
```

Use `onMdcuiExit` when a terminal Markdown app needs to submit or otherwise
process edited fields before it closes:

```js
export async function onMdcuiExit({ reason, path, $ }) {
  await rpc.saveDraft({
    reason,
    path,
    message: $('#message').val(),
  });
}
```

The callback is optional, may be asynchronous, and is called at most once for
each mdcui buffer.

The front and back code blocks are extracted and are not shown in the rendered
UI. In the terminal, `rpc` calls the generated backend module directly. In the
browser, it sends the call to the relative `rpc` endpoint under the printed
UUID URL (`/<uuid>/rpc`).

## Terminal interaction

Markdown files automatically use `mdcui` mode. Most rendered content remains
protected, while `text` block content rows can be edited. Navigation,
selection, search, and copy remain available.

| Input | Result |
| --- | --- |
| Arrow keys, `Home`, `End`, `PageUp`, `PageDown` | Move through the rendered UI. |
| `Enter` or `Space` | Activate the cell under the cursor. Put the cursor on a `javascript:` link to run it, or on or to the right of `☐` or `☒` to toggle that task. |
| Left click | Move to and activate the clicked cell. A `javascript:` link runs immediately; clicking on or to the right of `☐` or `☒` toggles that task. |
| Mouse wheel | Scroll three rows at a time. |
| `Shift` + arrow keys | Select rendered text. |
| `Ctrl-C` | Copy the selection, or the current line when nothing is selected. |
| `Ctrl-A` | Select all rendered text. |
| `Ctrl-F` | Search; use `Ctrl-N` and `Ctrl-P` for the next and previous match. |
| `Ctrl-G` | Open the editor help. |
| `Alt-G` | Show or hide the shortcut bar. |
| `Ctrl-Q` or `Alt-Q` | Close the current UI. |

The terminal automatically reflows the Markdown when its width changes.
Only `javascript:` links execute in the TUI; ordinary web links behave as
normal links in the browser.

Local Markdown images are displayed automatically in terminals that support
the Kitty graphics protocol. Relative image paths are resolved from the
Markdown file's directory. jsmdcui reads the image dimensions, reserves the
corresponding terminal rows, and updates the placement when the document is
scrolled, resized, or shown in a split pane. Unsupported or missing images, as
well as remote images not authorized with `--allow-url`, retain Bun's normal
linked `📷` fallback. To download trusted remote Markdown and display its
supported HTTP(S) images with Kitty graphics, combine the options:

```sh
bun src/index.js --kitty --allow-url https://example.com/app.md
```

## Browser interaction

The WUI uses normal browser mouse and keyboard behavior. Clicking a
`javascript:` link calls its front-end function, regular links navigate
normally, and task checkboxes can be toggled by clicking either the checkbox or
its associated text. `alert`, `confirm`, and `prompt` use the browser's built-in
dialogs. Checkbox changes exist only in the current page: refreshing does not
preserve them and does not update the Markdown file.

The WUI uses port `3000` by default and accepts connections through the
machine's available network interfaces. The printed `localhost` URL is for the
same machine. From another device on the same network, replace `localhost` with
the server machine's IP address and keep the same port and full path.

Each server start prints a new random path. The old URL stops working after the
server is stopped or restarted. Keep the process running while using the page,
and press `Ctrl-C` in its terminal to stop it.

## Generated files

Opening a local Markdown UI generates these files beside the source file:

```text
app.md.front.js
app.md.back.js
app.md.html
app.md-rpc.js
app.md-server.js
```

They are regenerated from `app.md`, so edit the Markdown source rather than the
generated files. The source directory must be writable.

From the project directory, remove generated `*.md.*` and `*.md-*` companion
files while keeping the Markdown source files:

```sh
bun ./clean.sh
```

### Generated heading sections

WUI output wraps each h1-h6 and its content in a hierarchical `<section>`.
Lower-level headings create nested sections; the next equal or higher-level
heading closes the applicable sections. Content before the first heading stays
outside all generated sections.

```html
<section>
  <h1 id="chapter">Chapter</h1>
  <section>
    <h2 id="topic">Topic</h2>
  </section>
</section>
```

This structure provides stable boundaries for CSS, DOM queries, and heading
task-list values. Heading-like text inside comments, scripts, styles, code,
textareas, and templates is protected and does not create sections.

## Security

A Markdown UI is an executable application, not a passive document. Starting a
WUI loads its backend module, loading the page runs its frontend module, and
activating a local terminal `javascript:` link runs frontend code. Backend and
terminal code can read or change files, start programs, access the network, and
read environment data with the permissions of the jsmdcui process. Only open
or serve Markdown UI files that you trust.

### WUI network exposure

> **Warning:** The WUI is intended for local or trusted-network use. It is not
> a production web server.

- There is no login, per-user authorization, or HTTPS. Traffic and results are
  sent over plain HTTP.
- The server may be reachable from other devices through the machine's network
  interfaces, even though the printed URL says `localhost`.
- The random path makes the URL harder to guess, but it is not a password.
  Anyone who can reach the server and obtains the complete URL can load the
  page and call every backend function published through WUI RPC, using
  arguments they choose.
- A backend RPC function runs with the same operating-system permissions as
  jsmdcui. Its code determines what files, commands, network services, or
  secrets a visitor may be able to reach.
- Do not share the complete URL, forward the port to the public internet, or
  run the WUI on an untrusted network. Use a firewall when needed and stop the
  server with `Ctrl-C` as soon as you finish.
- Prefixing a backend export with `_` keeps it out of WUI RPC discovery and
  calls, but it does not protect the backend module from trusted local code and
  is not a substitute for authentication.

## Development

```sh
npm run tui
npm run wui
npm run check
```

`testapp.md` is the main working example.

                         testapp.md
                              │
               ┌──────────────┴──────────────┐
               │                             │
               ▼                             ▼
          Browser HTML                    TUI ANSI
               │                             │
      javascript:foo()             extract javascript:
               │                             │
               ▼                             ▼
       window.frontFunc()          evalFront(frontMod, text)
               │                             │
               └──────────────┬──────────────┘
                              ▼
                    testapp.md.front.js
                              │
                         rpc.someFunc()
                  ┌───────────┴───────────┐
                  │                       │
               Browser                   TUI
                  │                       │
           RPC Proxy client       import * as rpc
                  │               from back module
                  ▼                       │
              fetch rpc                   │
                  │                       │
                  ▼                       │
             server.mjs                   │
                  │                       │
                  ▼                       │
       evalBack(backMod, reqjson)         │
                  │                       │
                  └───────────┬───────────┘
                              ▼
                    testapp.md.back.js
