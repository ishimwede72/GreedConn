# User guide

A task-oriented walkthrough of Greedcon's seven sidebar pages. Every button name below is the literal label in the UI (`webview/pages/*.ts`).

Open the extension with the **Greedcon** icon in the Activity Bar, `Ctrl+Shift+G` (`Cmd+Shift+G` on macOS), or the **Greedcon: Open** command. **Greedcon: Open in Editor Tab** (`greedcon.openPanel`) shows the same UI in a regular editor tab.

---

## 1. Getting started — Welcome page

The **Welcome** page opens first (and after **Greedcon: Open**) with:

- A hero (“Test. Build. Scale.”) and the header **Welcome to Greedcon**.
- Four clickable stats: **Collections**, **Environments**, **Requests sent**, **Test runs** — each jumps to its page.
- **Quick start** cards: **New Request**, **Import Collection**, **Create Environment**, **Write Tests**.
- **Recent activity** — the last five history rows (Method / Name / Status / When) with a **View all** button.
- An **About** card that explains the local-first model: requests run in the extension host over `node:http/https`, secrets live in SecretStorage, tests are declarative.

**Load demo data** (top right of the header) seeds a demo collection with sample requests (`Get Users`, `Create User`, …) and a demo environment containing `base_url` — safe to delete, created by *Load demo data*. If demo data already exists the button says so instead of duplicating it.

## 2. Building a request — Requests page

The **Requests** page has a URL bar on top and the builder/response below.

**URL bar:** method select (GET, POST, …) → **Request URL** input → environment select (**No environment** plus your environments) → **Send** / **Cancel** → **New request**. The hint under it reads *Draft saved automatically · Ctrl+Enter to send*; the draft is persisted (`settings.json`) and restored when the webview reloads.

**Builder tabs** (each shows a count where relevant):

| Tab | What you configure |
| --- | --- |
| **Params** | Query parameter rows (key/value/enabled/description) |
| **Headers** | Request headers — *“Headers sent with every request. Restricted headers are sanitized before sending.”* |
| **Body** | Body type select: **None**, **JSON**, **Raw text**, **XML**, **Form (urlencoded)**, **Form (multipart)**; a **Format** button pretty-prints JSON, and the editor validates JSON as you type |
| **Auth** | Authentication type (below) |
| **Tests** | Preview of the tests attached to this request, with **Open Tests page** |

**Body types:** *None* (“This request sends no body.”), *JSON* / *Raw text* / *XML* (single editor, `Format` for JSON), *Form (urlencoded)* (rows), *Form (multipart)* (rows with text or file parts — file parts are read from disk when the request is sent; missing files are reported as errors rather than sent empty).

**Auth types** (select labeled *Auth type*):

- **No Auth** — “No authentication will be applied.”
- **Bearer Token** — token field (password-style) + optional prefix; “Sent as: Authorization: Bearer &lt;token&gt;”. If the value came from SecretStorage it displays as `••••••••`.
- **Basic Auth** — Username / Password.
- **API Key** — key name (e.g. `X-API-Key`), value, and placement: **In header**, **In query parameter**, **In cookie**.
- **OAuth 2.0** — grant select (**Client Credentials**, **Authorization Code + PKCE**), Token URL, Client ID, Client secret, Scope (+ Audience), and an **Authorize** button. Authorization Code opens your system browser and waits for the loopback callback (up to 3 minutes); tokens are stored in SecretStorage.

Press **Send** (or `Ctrl+Enter`) to execute; **Cancel** aborts an in-flight request. Progress phases (resolving, authenticating, building, sending) appear in the response header area.

## 3. Reading the response

Above the tabs: the status badge, **Time**, **Size**, **Type** and a status chip (e.g. `200 OK`), plus an error code chip when the transport failed. Empty state: “Response will appear here”.

Five tabs:

| Tab | Contents |
| --- | --- |
| **Pretty** | Formatted, collapsible JSON with syntax tinting (non-JSON falls back to text) |
| **Raw** | The body exactly as received |
| **Preview** | Preview rendering of the body; binary responses show *Binary response — not displayed.* |
| **Headers** | Response header name/value list |
| **Tests** | Results of the assertions attached to this request (or *No tests run* with an **Open Tests** button) |

Warnings (rejected headers, unresolved `{{variables}}`, auth issues) are shown in a status line under the response.

## 4. Collections

Two-pane layout: tree on the left (**Search collections…** box, **Import** and **New** buttons) and **Details** on the right.

- **New** → *New collection* dialog (placeholder `My API`).
- Selecting a collection shows its name, request count, description, **Updated …**, and the action row: **New folder**, **New request**, **Rename**, **Duplicate**, **Export**, **Run tests**, **Delete**.
- **New request** saves the *current draft* into the collection root (toast: `Saved "…" into "…"`). If you haven't built a request yet it takes you to **Requests** first.
- Click any request card to load it into the builder (method badge, name, URL) — folders expand inline; each item has **Duplicate** and **Delete**.
- **Export** downloads the native format (`<name>.greedcon.json`, format id `greedcon-collection`, version 2).
- **Import** opens a file picker for `.json` files; Greedcon auto-detects the native format or **Postman Collection v2.1** and reports what it mapped (unknown Postman fields are preserved in descriptions instead of dropped).
- **Run tests** executes every request in the collection that has tests, sequentially, and records the runs (see **Tests → Run history**).

The same tree is available as a plain VS Code tree view (**Collections** view in the Activity Bar side bar), where selecting a request opens it in the builder.

## 5. Environments & variables

Header: **Environments** with **Import** and **New environment**, plus a notice: *“Secret variables are masked in the UI and never written to collections, history or exports.”*

- The left pane lists **Global variables** (*available everywhere*) first, then each environment (`N variable(s)`, **Active** chip, **Set active** button).
- The right pane edits the selected scope: rows of **Key** / **Value** (+ enabled/secret flags) with **Add variable**, and for environments also **Rename** and **Export**.
- The hint reads: *“Reference variables in URLs, headers and bodies as `{{variable_name}}`.”*
- Variables marked **secret** display as `••••••••` and carry a `secret` chip.

**Resolution rules** (see `src/environments/VariableResolver.ts`):

- `{{name}}` and `{{ name }}` both work; substitution happens in URL, params, headers, body and auth fields.
- **Environment variables override globals.** The request's environment select on the **Requests** page overrides the active environment for that send.
- Missing, disabled or circular references are **left untouched** and reported as warnings (never replaced with `undefined`); values may reference other variables up to a bounded depth.
- Variables used by tests' extractions are written into the **active** environment (created if missing).

**Import/Export:** **Export** produces `<name>.greedcon-env.json` (`format: greedcon-environment`, version 2) with secret values masked; **Import** accepts that file back.

## 6. Tests

Page header: **Tests** — *“Assert on status, timing, headers, body content and JSON paths — no scripts, no side effects.”* Actions: **Run now** and **Save**.

Three cards:

1. **Tests for the current request** — **Add test** (dialog *New test*, default name `Status Code is 200`; a new test starts with one `status equals 200` assertion). Each test card offers **Add assertion**, **Add extraction**, enable/disable, duplicate and delete.
2. **Run results** — the last run: per-assertion ✓/✗ lines, extraction results and `completed in N ms`.
3. **Run history** — **Refresh** plus a table: When / Request / Source / Passed / Failed / Total / Duration.

**Add assertion** is a guided dialog: pick what to assert (**Status code**, **Response time**, **Response body**, **Response header**, **JSON path**), then the comparison (`equals`, `notEquals`, `contains`, `notContains`, `matches`, `exists`, `notExists`, `lt`, `lte`, `gt`, `gte` — available operators depend on the type), then the value (e.g. *Expected status code* `200`, *Threshold (ms)* `500`, *Path (e.g. `$.data[0].id`)*).

**Add extraction** picks the source (**JSON path**, **Response header**, **Status code**) and stores the value into the active environment (e.g. `$.data.token` or `x-request-id`).

**Run now** saves, sends the current request with its environment, evaluates the tests and toasts `N/M assertions passed in X ms`. Tests also run automatically after every **Send** on the Requests page, and their results appear in the response's **Tests** tab.

**Run tests** on the Collections page runs all tests in a collection; those runs show up in **Run history** with source `collection`.

## 7. History

Every send is recorded (unless `greedcon.history.enabled` is off).

- Toolbar: search box **“Search by name, URL or status…”**, a method filter, status pills **All / 2xx / 3xx / 4xx / 5xx / Errors**, **Cleanup** (*Keep only the newest 50 entries*) and **Clear all** (confirmation required).
- Table columns: **When**, **Method**, **Name**, **URL**, **Status**, **Time**, **Size**, **Tests** (`passed/total`), plus a row action to re-run.
- Selecting a row expands details: timestamp · duration · size · environment, final URL after redirects, **Response headers** (sensitive headers masked) and **Response body** (capped at 64 KB when bodies are stored).
- Re-running an entry rebuilds a fresh request from its method/URL and sends it.
- History entries keep test summaries but never raw credentials; body storage follows `greedcon.history.storeResponseBody` and retention follows `greedcon.history.limit`.

## 8. Settings page

Four cards:

- **Appearance & behavior** — **Default response view** select: `Pretty (formatted JSON)`, `Raw`, `Preview`. Note: *“Greedcon follows your VS Code theme for fonts and adapts its sidebar colors.”*
- **Data** — counts (Collections / Environments / History entries / Test runs) and actions: **New request**, **Open collections**, **Import collection**, **Reset history** (deletes history only), **Erase everything** — requires typing `ERASE` in the confirmation dialog and then removes all collections, environments and history.
- **Security** — the built-in protections summary (SecretStorage-backed secrets, strict CSP with nonce-only execution, declarative tests, sanitized URLs/headers with optional private-network blocking, redacted capped history) and an **Open VS Code settings** button.
- **About** — version, *local-first API testing*, **Reload webview** and **Re-run setup demo** (re-seeds demo data).

## 9. Commands & keybindings reference

| Command | Keybinding | Effect |
| --- | --- | --- |
| Greedcon: Open | `Ctrl+Shift+G` / `Cmd+Shift+G` | Show the Greedcon view on **Welcome** |
| Greedcon: New Request | `Ctrl+Shift+N` / `Cmd+Shift+N` | Reset the draft and open **Requests** |
| Greedcon: Save Request to Collection | — | Opens **Collections** with a hint toast (save from the builder) |
| Greedcon: Import Collection | — | Opens **Collections** with a hint toast (*Use the Import button in Collections.*) |
| Greedcon: Export Collection | — | Quick-pick a collection, then save it as JSON |
| Greedcon: Open History | — | Opens **History** |
| Greedcon: Run Tests | — | Opens the **Tests** page for the current draft |
| Greedcon: Open Settings | — | Opens **Settings** |
| Greedcon: Open in Editor Tab | — | Same UI in an editor tab |
| Greedcon: Clear History | — | Modal confirmation, then clears recorded history |

## 10. Where your data goes

Collections, environments, history, settings and test runs are JSON files under VS Code's `globalStorage` directory; secrets are in VS Code's SecretStorage. Nothing leaves your machine except the HTTP requests you send (and OAuth2 flows you start). See [INSTALLATION.md](./INSTALLATION.md#where-data-is-stored) for exact paths and [SECURITY.md](./SECURITY.md) for the full policy.
