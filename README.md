# Greedcon

**Professional API testing and development platform for VS Code.** Build, send and inspect HTTP requests, manage collections, environments and automated tests — all locally, inside your editor.

Greedcon is a local-first alternative to Postman / Thunder Client: your data lives in files on your machine, requests are executed by the extension host with Node's own `node:http` / `node:https` modules, and there are **no runtime dependencies, no cloud sync and no telemetry**.

---

## Features

- **Request builder** — one URL bar with method selector, plus tabs for **Params**, **Headers**, **Body**, **Auth** and **Tests**. Body types: `None`, `JSON`, `Raw text`, `XML`, `Form (urlencoded)` and `Form (multipart)` (text parts and file parts read from disk). Authentication: `No Auth`, `Bearer Token`, `Basic Auth`, `API Key` (in header, query parameter or cookie) and `OAuth 2.0` (Client Credentials, Authorization Code + PKCE with a loopback redirect).
- **Response viewer** — status chip, **Time** / **Size** / **Type** readout and five tabs: **Pretty**, **Raw**, **Preview**, **Headers** and **Tests**.
- **Collections** — recursive folders and requests, search, save the current draft into a collection, import (native Greedcon format and **Postman Collection v2.1**), export to `.greedcon.json`, and **Run tests** across every request in a collection.
- **Environments** — global variables plus per-environment variables referenced as `{{variable}}` in URLs, headers, params, bodies and auth fields; the environment overrides globals; secret variables are masked with `••••••••`.
- **Declarative tests** — assertions on status code, response time, body content, headers and JSON paths, plus extractions (JSON path / header / status) that write values back into the active environment. Tests run automatically after a send, and every run is kept in run history. **No user scripts are ever executed.**
- **History** — every send is recorded (redacted headers, capped bodies), with search, method and status-group filters, one-click re-run and cleanup.
- **Local-first & private** — data stored under VS Code's `globalStorage`, credentials in VS Code **SecretStorage** (OS keychain), strict webview CSP with per-load nonces, sensitive values redacted from logs, history and exports.

## The seven sidebar pages

The Greedcon view in the Activity Bar hosts a single webview app with a sidebar of seven pages (the same UI also opens as an editor tab via **Greedcon: Open in Editor Tab**):

- **Welcome** — hero, quick stats (collections, environments, requests sent, test runs), four quick-start cards (New Request, Import Collection, Create Environment, Write Tests), recent activity and the **Load demo data** button that seeds a demo collection and environment.
- **Requests** — the request builder (method + URL bar, environment selector, **Send** / **Cancel**, `Ctrl+Enter` sends) above the response viewer; the draft is saved automatically and restored after reloads.
- **Collections** — two-pane layout: searchable collection/folder/request tree on the left, details on the right with **New folder**, **New request**, **Rename**, **Duplicate**, **Export**, **Run tests** and **Delete**.
- **Environments** — environment list with active selection, global variables, per-environment variable tables (key/value/enabled/secret) and **Import** / **Export**.
- **History** — search box, method filter, status pills (`All`, `2xx`, `3xx`, `4xx`, `5xx`, `Errors`), a table of When / Method / Name / URL / Status / Time / Size / Tests, expandable details with response headers and body, **Cleanup** and **Clear all**.
- **Tests** — assertion builder for the current request (**Add test**, **Add assertion**, **Add extraction**, **Run now**, **Save**), the run result panel and a **Run history** table.
- **Settings** — _Appearance & behavior_ (default response view), _Data_ (counts, **Import collection**, **Reset history**, **Erase everything** behind a type-`ERASE` confirmation), _Security_ (summary of the built-in protections + link to VS Code settings) and _About_.

## Requirements

|                             |                                                                              |
| --------------------------- | ---------------------------------------------------------------------------- |
| **VS Code**                 | `^1.85.0` (from `engines.vscode` in `package.json`)                          |
| **Node.js for development** | Node.js 26 with npm (the toolchain used to develop and CI-test this project) |
| **Runtime dependencies**    | none — `package.json` declares no `dependencies`                             |

## Install from source

```bash
git clone https://github.com/ishimwede72/GreedConn.git
cd GreedConn
npm ci
npm run compile
```

Then either:

- **Run it unpacked** — open the folder in VS Code and press **F5** to launch an Extension Development Host using the included launch configuration, or
- **Package it** — `npm run package` produces `dist/greedcon.vsix`; install it with `code --install-extension dist/greedcon.vsix`.

Full details, including troubleshooting, are in [docs/INSTALLATION.md](docs/INSTALLATION.md).

## Quick start

1. Install the extension (or launch the Extension Development Host) and click the **Greedcon** icon in the Activity Bar — or press `Ctrl+Shift+G` (`Cmd+Shift+G` on macOS).
2. On the **Welcome** page press **Load demo data** to get a demo collection (`Get Users`, `Create User`, …) and a demo environment with `base_url`.
3. Go to **Requests**, pick a method, type a URL (variables like `{{base_url}}` work), add params/headers/body/auth as needed, and press **Send** (`Ctrl+Enter`).
4. Inspect the response in **Pretty** / **Raw** / **Preview** / **Headers** / **Tests**.
5. Add assertions on the **Tests** page, then re-send — results appear in the response's **Tests** tab and in run history.

### Commands and keybindings

| Command               | Default keybinding             |
| --------------------- | ------------------------------ |
| Greedcon: Open        | `Ctrl+Shift+G` / `Cmd+Shift+G` |
| Greedcon: New Request | `Ctrl+Shift+N` / `Cmd+Shift+N` |

The Command Palette also exposes _Save Request to Collection_, _Import/Export Collection_, _Open History_, _Run Tests_, _Open Settings_, _Open in Editor Tab_ and _Clear History_.

## Screenshots

No screenshot images are shipped in this repository yet — nothing is shown here rather than embedding images that do not exist. What to expect once you run it: a **dark charcoal UI with a purple (`#7c5cff`) accent** (design tokens live in `webview/styles/variables.css`), a left navigation rail with the seven pages above, and a status/method-colored request workspace. Each page is described in [docs/USER_GUIDE.md](docs/USER_GUIDE.md).

## npm scripts

All scripts as declared in `package.json`:

| Script                                    | What it does                                                                       |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `npm run compile`                         | Runs `scripts/build.ts` — the same command VS Code executes on `vscode:prepublish` |
| `npm run watch`                           | Rebuild on change (`esbuild.js --watch`)                                           |
| `npm run build`                           | One-shot esbuild bundle (`esbuild.js`)                                             |
| `npm run clean`                           | Remove build output                                                                |
| `npm run typecheck`                       | `tsc --noEmit` for both the extension and webview configs                          |
| `npm run lint` / `npm run lint:fix`       | ESLint over the repo                                                               |
| `npm run format` / `npm run format:check` | Prettier write / check                                                             |
| `npm test`                                | Full Vitest run (unit + integration)                                               |
| `npm run test:unit`                       | Unit tests only                                                                    |
| `npm run test:integration`                | Integration tests only                                                             |
| `npm run test:watch`                      | Vitest watch mode                                                                  |
| `npm run package`                         | Runs `scripts/package.ts` to produce the `.vsix`                                   |
| `npm run verify`                          | Runs `scripts/verify.ts`, the project's verification script                        |

## Documentation

| Document                                                       | Contents                                                                    |
| -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)                   | Layers, message protocol, data flow, module map, build pipeline             |
| [docs/SECURITY.md](docs/SECURITY.md)                           | Threat model and every control (CSP, secrets, URL/header policy, redaction) |
| [docs/USER_GUIDE.md](docs/USER_GUIDE.md)                       | Task-oriented walkthrough of all seven pages                                |
| [docs/INSTALLATION.md](docs/INSTALLATION.md)                   | Source install, dev setup, packaging, data locations, troubleshooting       |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)                   | Setup, style, tests, and how to extend the code                             |
| [docs/IMPLEMENTATION_STATUS.md](docs/IMPLEMENTATION_STATUS.md) | Phase status, verification checklist, known gaps                            |
| [CHANGELOG.md](CHANGELOG.md)                                   | Release history                                                             |
