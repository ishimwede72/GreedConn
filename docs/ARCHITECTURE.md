# Architecture

Greedcon is a VS Code extension made of two bundled programs that talk over a typed message protocol:

```
┌──────────────────────────────────────────────────────────────────────────┐
│ WEBVIEW (untrusted, browser context)                                    │
│  webview/app.ts → Sidebar + 7 pages + components + state                │
│  renders with textContent only; strict CSP + per-load nonce              │
└───────────────▲───────────────────────────────┬──────────────────────────┘
                │ { id, ok, data | error }      │ { id, type, data }
                │ { type:'event', name, data }  │
┌───────────────┴───────────────────────────────▼──────────────────────────┐
│ MESSAGING (host side)                                                    │
│  MessageValidator → MessageRouter → MessageHandlers                      │
└───────────────▲──────────────────────────────────────────────────────────┘
                │ plain objects / plain data
┌───────────────┴──────────────────────────────────────────────────────────┐
│ SERVICES — `GreedconServices` (composition root, src/services)           │
│  ├─ storage   JsonStorage + repositories (collections/environments/      │
│  │            history/settings/testRuns) + BackupManager                 │
│  ├─ engine    RequestExecutor → HttpClient (node:http/https)             │
│  ├─ testing   TestRunner (declarative assertions + extractions)          │
│  ├─ auth      AuthenticationManager + CredentialStore + OAuth2Manager    │
│  ├─ security  SecurityManager, SecretManager, URL/header policy          │
│  └─ router    MessageRouter (broadcast to every attached webview)        │
└──────────────────────────────────────────────────────────────────────────┘
```

Everything above the storage/engine layer runs in the extension host; the webview never touches the filesystem or the network directly.

---

## 1. Webview layer (`webview/`)

The webview is a small SPA bundled as `media/webview.js` + `media/webview.css`.

| Area | Files | Role |
| --- | --- | --- |
| Entry | `app.ts` | Boots the layout, performs the `app.init` handshake, subscribes to host events, routes between pages |
| Pages | `pages/` (8 files) | `WelcomePage`, `RequestPage`, `CollectionsPage`, `EnvironmentsPage`, `HistoryPage`, `TestsPage`, `SettingsPage`, plus shared `types.ts` |
| Components | `components/` (10) | `dom` (hyperscript helper), `Tabs`, `KeyValueEditor`, `CodeEditor`, `JsonViewer`, `Modal`, `Toast`, `Loading`, `Sidebar`, `ui` |
| State | `state/` (3) | `AppState` (event emitter + app state), `NavigationState`, `RequestState` |
| Services | `services/` (6) | `VsCodeBridge` plus `RequestService`, `CollectionService`, `EnvironmentService`, `HistoryService`, `TestService` |
| Styles | `styles/` (12) | Design tokens (`variables.css`: dark charcoal surfaces + `#7c5cff` accent), layout, components, responsive rules |

Two invariants hold across the layer:

- **No `innerHTML` for content.** `components/dom.ts` sets text through `textContent`, and `JsonViewer` builds its syntax highlighting out of text nodes/spans. Response bodies, header values, names and URLs from the network therefore cannot inject markup.
- **All outbound traffic goes through `VsCodeBridge`.** It correlates each request with an `id`, applies a timeout (30 s default, longer for sends/OAuth), and dispatches host-pushed events. Outside VS Code (`window.acquireVsCodeApi` missing) it degrades to an offline preview where bridge calls reject instead of hanging.

## 2. Message protocol (`src/types/Messages.ts`, `src/messaging/`)

Three envelope shapes:

```ts
// webview → host (expects a reply)
{ id: string, type: string, data?: object }

// host → webview (reply)
{ id: string, ok: boolean, data?: T, error?: { code: string, message: string } }

// host → webview (unsolicited push)
{ type: 'event', name: WebviewEventName, data: WebviewEventMap[name] }
```

- **54 request types** are enumerated in `src/messaging/MessageTypes.ts` (`app.*`, `request.*`, `collections.*`, `environments.*`, `history.*`, `tests.*`, `auth.*`, `settings.*`, `demo.seed`).
- **11 event names** are declared in `WebviewEventMap`: `request.started`, `request.progress`, `request.completed`, `request.cancelled`, `collections.changed`, `environments.changed`, `history.changed`, `settings.changed`, `page.changed`, `toast`, `log`.

**Validation happens on both sides:**

- *Host* — `MessageValidator.validateWebviewMessage()` runs before any handler: plain-object check, `id` length ≤ 128, type must be in `MESSAGE_TYPES` (unknown types are rejected), then a per-type payload validator that enforces field types and size caps (URL ≤ 8192, ≤ 500 params/headers, body text ≤ 5 MB, import content ≤ 10 MB, …) and normalizes rows/auth through `sanitizeText` / `sanitizeMultiline`. Failures are answered with `INVALID_MESSAGE`; a registered handler that throws answers with `HANDLER_ERROR`; a known type with no handler answers with `NOT_IMPLEMENTED`.
- *Webview* — `VsCodeBridge` ignores anything that is not a plain object, requires a string `id` on replies and a `type === 'event'` shape on pushes; outbound payloads are constrained by the compile-time `WebviewMessageMap` and re-checked on arrival by the host.

`MessageRouter` owns the registry (`register(type, handler)`), the single `handle(raw)` entry point wired to `webview.onDidReceiveMessage`, and `emit(name, data)` for broadcasts. `GreedconServices` gives the router a transport that fans out to every attached webview, so the sidebar view and any open editor-tab panels stay in sync.

`MessageHandlers` is the application-service layer behind the router: one `register()` method maps each validated payload to domain calls and returns plain serializable data — never secrets (auth configs are masked with `maskForDisplay` before they travel to the UI).

## 3. Services — `GreedconServices` (`src/services/GreedconServices.ts`)

`createServices({ context })` is the composition root; `src/extension.ts` builds it once and passes it to providers, commands and the message layer. It owns:

| Member | Purpose |
| --- | --- |
| `storage` | `StorageManager` (JSON provider, repositories, backups, notices) |
| `collections` | `CollectionManager` over `CollectionRepository` |
| `environments` | `EnvironmentManager` (variables, resolver, masking, extractions) |
| `history` | `HistoryManager` (record/search/cleanup, redaction, body caps) |
| `testRunner` | `TestRunner` (declarative test execution) |
| `executor` | `RequestExecutor` (request pipeline) |
| `cancellation` | `CancellationManager` (AbortController per in-flight request) |
| `auth`, `credentials`, `oauth2` | Authentication pipeline + secret-backed credential store |
| `secrets` | `SecretManager` over VS Code `SecretStorage` |
| `security` | `SecurityManager` (limits + policy from VS Code configuration) |
| `router` | `MessageRouter` |
| `version` | Extension version from `package.json` |
| `broadcast()` | Push an event to every attached webview |

`MessageHandlers` is constructed in the same factory with exactly the services it needs, so the wiring stays in one file.

## 4. Storage layer (`src/storage/`)

`StorageManager` resolves the data directory from `context.globalStorageUri.fsPath` and builds one `JsonStorage` provider with `SCHEMA_VERSION = 2` and the migration table from `StorageMigration.ts`.

`JsonStorage` guarantees:

- **Atomic writes** — `writeJsonAtomic()` writes `<file>.<pid>.<ts>.tmp`, then `rename()`s it over the target (see `src/utils/FileUtils.ts`), so a crash never leaves a half-written document.
- **Schema versioning + migrations** — every document is an envelope `{ version, updatedAt, data }`. On read, migrations keyed by *source* version run in a loop (`v1 → v2` today: bare arrays → typed records, `requests`/`folders` → recursive `items` with `type` discriminators, variable `enabled` flags, settings `ui` block) and the result is persisted; human-readable notes are collected for the UI. Legacy unwrapped files are wrapped as version 1 and migrated forward; files written by a *newer* schema load best-effort with a warning.
- **Corruption quarantine** — an unparseable file is copied to `<file>.corrupt.<timestamp>` and never overwritten in place; the loader then tries backups (`.bak.1 … .bak.3`, `.manual.bak`) and reports `corrupted` only if nothing is recoverable. `StorageManager` turns this into a user notice plus an Output-channel line.
- **Rotating backups** — before each write the previous file is rotated through `.bak.1 … .bak.3` (3 kept per file). `BackupManager` additionally creates full timestamped snapshots of `collections.json`, `environments.json`, `history.json`, `settings.json`, `testRuns.json` under `backups/<timestamp>_<label>/` and can restore them (taking a `pre-restore` snapshot first).
- **Path-safety** — `resolve()` accepts only the five known `.json` names (no traversal).

Repositories (`CollectionRepository`, `EnvironmentRepository`, `HistoryRepository`, `SettingsStorage`, `TestRunsRepository`) are thin typed wrappers over that provider; managers (`CollectionManager`, `EnvironmentManager`, `HistoryManager`) hold the domain logic on top of them.

## 5. Engine (`src/engine/`)

`RequestExecutor.execute()` runs a fixed pipeline (documented in its header):

```
validate → resolve variables → apply auth → build → send → parse
```

- **Resolve variables** — `EnvironmentManager.resolveRequest()` → `VariableResolver` substitutes `{{name}}` in URL, params, headers, body and auth (environment scope overrides globals; depth-limited with cycle detection; missing/disabled/malformed references are reported as issues and the original text is kept).
- **Apply auth** — `AuthenticationManager.prepareForExecution()` injects real secret values from SecretStorage into a throwaway auth config, then `apply()` produces headers/query/cookie material (Bearer, Basic, API key, OAuth2 access token).
- **Build** — `RequestValidator` (URL policy, ≤ 200 params, ≤ 100 headers, ≤ 20 MB body, timeout 100–600000 ms) and `RequestBuilder` assemble the request: `QueryManager` for the query string, `HeaderManager` for headers (sanitized, forbidden hop-by-hop names rejected), `BodyManager` for the wire body (JSON/text/XML buffers, urlencoded form, multipart with a fixed boundary where file parts are read from disk and read errors are reported instead of silently omitted).
- **Send** — `HttpClient` on **`node:http` / `node:https`** with zero third-party networking dependencies: `AbortSignal` cancellation, a timeout timer, a streaming response-size cap (the socket is destroyed past the cap and a truncated body is returned), TLS validation controlled by `greedcon.request.validateSsl`, and a redirect loop over `301/302/303/307/308` that re-validates every hop against the URL policy, blocks HTTPS→HTTP downgrades (unless allowed), drops `authorization`/`cookie` on cross-origin hops, and applies the 303/301-302 method-downgrade rules. 4xx/5xx are **never** thrown — they come back as normal responses.
- **Parse** — `ResponseParser` produces the `HttpResponseModel` (status, headers, cookies, body, `bodyKind`, `responseTime`, `responseSize`, `contentType`, final URL, redirect count); transport failures are classified by `NetworkErrorHandler` into an error response (`ABORT_ERR`, `ETIMEDOUT`, DNS/TLS categories …) so the UI can render them uniformly.

Progress callbacks (`resolving` → `authenticating` → `building` → `sending`) are forwarded to the webview as `request.progress` events.

## 6. Testing (`src/testing/`)

Declarative only — **there is no user script execution anywhere in the pipeline**:

- `TestParser.parseTests()` validates/normalizes test definitions arriving from the UI, imports or storage (invalid assertions are dropped with warnings).
- `TestRunner.run()` walks `TestDefinition[]` against a response: each assertion goes through `TestAssertion.evaluateAssertion()`, which dispatches to one of five evaluators in `src/testing/assertions/` — `StatusAssertion`, `ResponseTimeAssertion`, `BodyAssertion`, `HeaderAssertion`, `JsonPathAssertion`.
- Extractions (`jsonPath` / `header` / `status`) resolve a value and hand it to the `onExtract` hook, which `MessageHandlers` wires to `EnvironmentManager.setExtractedValue()` (written into the **active** environment).
- `TestResult` computes per-assertion statuses and the run summary; `TestReporter.renderRun()` shapes it for the UI. Runs are persisted in `testRuns.json` via `TestRunsRepository` with a `source` of `request` / `collection` / `manual`.

## 7. Authentication & secrets

- `SecretManager` wraps `vscode.SecretStorage` with the `greedcon.secret.` prefix plus a metadata record; callers only ever see opaque `sec_*` ids.
- `AuthenticationManager.prepareForStorage()` moves bearer tokens, basic passwords, API-key values and OAuth2 client secrets into SecretStorage **before** anything is persisted, replacing the field with `••••••••`; `maskForDisplay()` masks configs sent to the webview; `prepareForExecution()` re-materializes real values only for the duration of a send.
- `OAuth2Manager` implements Client Credentials and Authorization Code + PKCE: the latter starts a one-shot loopback server on `127.0.0.1:<53000–53999>/callback`, validates `state` and the PKCE verifier, and stores access/refresh tokens only in SecretStorage.

## 8. End-to-end data flow: sending a request

1. **UI** — `RequestPage` collects the draft (method, URL, params, headers, body, auth, timeout, tests) and `RequestService.send()` posts `request.send` with `{ request, environmentId? }` (bridge timeout = `max(60000, timeout + 15000)`).
2. **Validate** — `MessageRouter.handle()` → `MessageValidator` checks the envelope and the request draft; a bad payload returns `{ ok:false, error:{ code:'INVALID_MESSAGE' } }` and the pipeline stops.
3. **Dispatch** — the `request.send` handler emits `request.started`, resolves the target environment (per-request override, else the active one) and calls `RequestExecutor.execute()`.
4. **Resolve → auth → build** — variables are substituted (issues become warnings), secrets are injected from SecretStorage, and the request is validated/built under the current security policy (`greedcon.security.*`, `greedcon.request.*`). A validation failure short-circuits into an error response with code `VALIDATION`.
5. **Send** — `HttpClient` performs the request(s), following redirects within the policy; the `CancellationManager`'s `AbortController` backs the **Cancel** button (`request.cancel`).
6. **Parse** — `ResponseParser` returns the response model (or a classified error response).
7. **Tests** — if the draft has tests, `TestRunner` evaluates them, extractions write into the active environment, and the run is appended to `testRuns.json`.
8. **Persist** — the draft is saved to `settings.json` (the same stored draft that `app.saveDraft` writes and `app.init` restores), and `HistoryManager.record()` appends a history entry with redacted headers and a body capped at 64 KB (subject to `greedcon.history.*`).
9. **Reply + events** — the handler returns `{ response, warnings, testRun, variableIssues }` as the `ok` reply; it also pushes `history.changed` and finally `request.completed`, which the webview uses to render the response viewer and toast a summary.

The same executor path is reused by `history.rerun` (rebuilds a request from a history entry), `tests.run`, and `tests.runCollection` (sequential execution of every request in a collection that defines tests).

## 9. File / module map

**Extension host — `src/` (14 folders + entry files):**

| Path | Contents |
| --- | --- |
| `extension.ts` | Activation: output channel, service wiring, webview view, three tree views, commands, config-change handling |
| `configuration.ts` / `constants.ts` | VS Code configuration reader; extension/command/view ids |
| `authentication/` (6) | `AuthenticationManager`, `ApiKeyAuth`, `BasicAuth`, `BearerAuth`, `OAuth2Auth`, `CredentialStore` |
| `collections/` (10) | `CollectionManager`, `CollectionRepository`, `FolderManager`, `RequestRepository`, `CollectionValidator`, `CollectionImporter`, `CollectionExporter`, `formats/` (`GreedconFormat`, `PostmanImporter`, `ImportFormatRegistry`) |
| `commands/` (9) | One module per contributed command + `index.ts` registration |
| `engine/` (12) | `RequestExecutor`, `RequestValidator`, `RequestBuilder`, `HttpClient`, `BodyManager`, `HeaderManager`, `QueryManager`, `ResponseParser`, `ResponseFormatter`, `TimeoutManager`, `CancellationManager`, `NetworkErrorHandler` |
| `environments/` (5) | `EnvironmentManager`, `EnvironmentRepository`, `VariableResolver`, `VariableValidator`, `VariableMasker` |
| `history/` (4) | `HistoryManager`, `HistoryRepository`, `HistorySearch`, `HistoryCleanup` |
| `messaging/` (4) | `MessageRouter`, `MessageHandlers`, `MessageValidator`, `MessageTypes` |
| `providers/` (7) | `GreedconViewProvider` (sidebar webview), `GreedconPanelProvider` (editor tabs), `WebviewHost` (CSP/nonce/message wiring), `GreedconTreeProvider` + Collections/Environments/History tree providers |
| `security/` (7) | `SecurityManager`, `UrlValidator`, `HeaderSanitizer`, `InputSanitizer`, `RedactionManager`, `SecretManager`, `WebviewSecurity` |
| `services/` (1) | `GreedconServices` composition root |
| `storage/` (10) | `StorageManager`, `JsonStorage`, `StorageMigration`, `BackupManager`, `StorageProvider`, `repositories/` (collection, environment, history, settings, testRuns) |
| `testing/` (12) | `TestRunner`, `TestAssertion`, `TestParser`, `TestReporter`, `TestResult`, `TestContext`, `assertions/` (status, responseTime, body, header, jsonPath, shared) |
| `types/` (9) | Shared domain types: `Request`, `Response`, `Collection`, `Environment`, `History`, `Testing`, `Storage`, `Messages`, `Authentication` |
| `utils/` (7) | `Logger` (redacting), `FileUtils` (atomic write/rotation), `JsonUtils`, `DateUtils`, `ErrorUtils`, `IdGenerator`, `ValidationUtils` |

**Webview — `webview/`:** see the table in §1 (`app.ts`, `components/`, `pages/`, `services/`, `state/`, `styles/`).

**Tests — `tests/`:** `unit/**` (per-module unit tests), `integration/**` (loopback HTTP servers), `mocks/vscode.mock.ts` (the `vscode` module alias used by every test).

## 10. Build pipeline

| Step | Command | Output |
| --- | --- | --- |
| Bundle extension | `node esbuild.js` (also `npm run build` / `npm run watch`) | `dist/extension.js` — CJS, platform `node`, target `node20`, `vscode` marked external, minified outside watch |
| Bundle webview | same invocation (second build entry) | `media/webview.js` (IIFE, browser, targets `chrome110/firefox115/safari16`) + `media/webview.css` pulled in through CSS imports from `app.ts` |
| Typecheck | `npm run typecheck` | `tsc --noEmit` on `tsconfig.json` (src + tests + scripts) and `tsconfig.webview.json` (webview + shared types) |
| Lint / format | `npm run lint`, `npm run format` | ESLint flat config + Prettier (`printWidth 100`, single quotes) |
| Test | `npm test` (`test:unit`, `test:integration`) | Vitest; `vscode` is aliased to `tests/mocks/vscode.mock.ts` so the whole extension runs outside VS Code; in CI a JUnit report is written to `dist/test-results/junit.xml` |
| Build entry | `npm run compile` (`scripts/build.ts`, also wired to `vscode:prepublish`) | the pre-package build |
| Package | `npm run package` (`scripts/package.ts`) | the `.vsix` |

Packaging excludes sources via `.vscodeignore` (only `dist/`, `media/`, `resources/`, `README.md`, `CHANGELOG.md` and friends ship) and the extension has **no runtime dependencies**, so `node_modules` is not needed at run time.
