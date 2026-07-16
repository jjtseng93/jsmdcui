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

## Quick start

jsmdcui requires [Bun](https://bun.com). On Android, install it in Termux:

```sh
npm install -g bun
```

On other platforms, follow the [official Bun installation guide](https://bun.com/docs/installation).

Choose either of these two ways to run jsmdcui.

> **Important:** Opening or rendering a local `.md` file writes or overwrites
> five generated files beside it. Starting `--wui` without a file writes the
> five files generated from `testapp.md` in the current directory. The source
> Markdown is not changed, but you should run the demo in a directory where
> overwriting generated files is safe.

### Route 1: Run with npx

This route requires both `npx` and `bun` on your `PATH`; no source checkout is
required. Open the normal terminal editor:

```sh
npx jsmdcui
```

Or start the default browser demo:

```sh
npx jsmdcui --wui
```

If the current directory already contains `testapp.md`, that local file is used
instead of the bundled demo. To open your own Markdown UI, pass its path:

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

The last command opens the included demo in the terminal. Use the arrow keys to
move, `Enter` or `Space` to activate an item, and `Ctrl-Q` to quit. To open the
same demo in a browser instead:

```sh
bun src/index.js --wui testapp.md
```

After starting `--wui`, open the last printed `http://...` URL in a browser.
Keep the command running while using the page, and press `Ctrl-C` in that
terminal to stop the server.

The command table below uses the cloned-source form. If you use npx, replace
`bun src/index.js` with `npx jsmdcui`.

| Command | Result |
| --- | --- |
| `bun src/index.js app.md` | Render `app.md` as a read-only terminal UI and write five generated files beside it. |
| `bun src/index.js --edit app.md` | Open `app.md` as editable UTF-8 source, overriding automatic Markdown UI detection. |
| `bun src/index.js --cat app.md` | Render the terminal version to stdout, write five generated files beside it, and exit. |
| `bun src/index.js --testapp.md` | Write the bundled `testapp.md` source to stdout and exit. |
| `bun src/index.js --demo` | Outputs & overwrites `./testapp.md`, opens it in the terminal UI, and writes 5 generated files beside it. |
| `bun src/index.js --allow-url URL.md` | Download HTTP(S) Markdown to the current directory, write 5 generated files, and allow its embedded code to run. Only use trusted URLs. |
| `bun src/index.js --wui` | Use local `testapp.md` when present, otherwise use the bundled demo; write five generated files in the current directory, then print and serve a random URL. |
| `bun src/index.js --wui app.md` | Write five generated files beside `app.md`, then print and serve a random URL. |
| `PORT=8080 bun src/index.js --wui app.md` | Start the browser UI on another port. |
| `bun src/index.js` | Open the normal terminal editor with an empty buffer. |

Run `npx jsmdcui --help` or `bun src/index.js --help` for all command-line
options.

## Write a Markdown UI

Create `app.md`:

````md
# My app

- [Say hello](javascript:sayHello())
- [Get server time](javascript:showServerTime())

```js front
export function sayHello() {
  const name = prompt("Your name:", "World");
  if (name) alert(`Hello, ${name}!`);
}

export async function showServerTime() {
  const time = await rpc.getServerTime();
  alert(time);
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

The front and back code blocks are extracted and are not shown in the rendered
UI. In the terminal, `rpc` calls the generated backend module directly. In the
browser, it sends the call to the relative `rpc` endpoint under the printed
UUID URL (`/<uuid>/rpc`).

## Terminal interaction

Markdown files automatically use `mdcui` mode. The rendered buffer is
read-only, but navigation, selection, search, and copy remain available.

| Input | Result |
| --- | --- |
| Arrow keys, `Home`, `End`, `PageUp`, `PageDown` | Move through the rendered UI. |
| `Enter` or `Space` | Activate the cell under the cursor. Put the cursor on a `javascript:` link to run it. |
| Left click | Move to and activate the clicked cell. A `javascript:` link runs immediately. |
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

## Browser interaction

The WUI uses normal browser mouse and keyboard behavior. Clicking a
`javascript:` link calls its front-end function, regular links navigate
normally, and task checkboxes can be toggled. `alert`, `confirm`, and `prompt`
use the browser's built-in dialogs. Checkbox changes exist only in the current
page: refreshing does not preserve them and does not update the Markdown file.

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
