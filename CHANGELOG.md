# Changelog

All notable changes to Greedcon are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Full documentation set: `README.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `docs/USER_GUIDE.md`, `docs/INSTALLATION.md`, `docs/CONTRIBUTING.md`, `docs/IMPLEMENTATION_STATUS.md`.
- GitHub Actions CI workflow (`.github/workflows/ci.yml`): typecheck → lint → test → build → package, with the `.vsix` uploaded as an artifact.
- MIT license, valid extension icon, and VS Code launch/task configuration for the Extension Development Host.

### Fixed

- Secret-looking query values, including custom API-key parameters, are masked in logs, history, exports, and responses that reflect them.
- Request drafts, imported collections, and OAuth2 token references keep credentials in VS Code SecretStorage instead of plaintext storage.
- Packaging now validates the icon PNG dimensions, includes the MIT license, and reports invalid packaging assets before invoking `vsce`.
- Installation instructions now match the checked-in launch configuration and available scripts.

## [1.0.0]

### Added

**Requests**

- Request builder with method selector (GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS), URL bar, environment selector and Send/Cancel (`Ctrl+Enter` sends).
- Builder tabs: **Params**, **Headers**, **Body**, **Auth**, **Tests** with per-tab counts.
- Body types: None, JSON (with format/validate), Raw text, XML, Form (urlencoded), Form (multipart) including file parts read from disk.
- Authentication: No Auth, Bearer Token, Basic Auth, API Key (header / query / cookie placement) and OAuth 2.0 (Client Credentials, Authorization Code + PKCE with loopback callback, `state` + PKCE validation).
- Auto-saved request draft restored across webview reloads; progress phases reported while sending; cancellation of in-flight requests.

**Responses**

- Response viewer tabs **Pretty**, **Raw**, **Preview**, **Headers**, **Tests** with status badge, time, size and content-type readout.
- Warnings surface for rejected headers, unresolved variables and authentication issues; transport failures are rendered as classified error responses (timeout, abort, DNS, TLS).

**Collections**

- Recursive collections/folders/requests with search, save current draft, rename, duplicate, move, delete.
- Import: native Greedcon collection (v2) and Postman Collection v2.1 with auto-detection; unknown Postman fields preserved with warnings instead of dropped.
- Export to `<name>.greedcon.json`; collection-wide **Run tests**; Collections/Environments/History tree views in the side bar.

**Environments**

- Global variables plus per-environment variables referenced as `{{variable}}` in URLs, params, headers, bodies and auth fields.
- Environment-over-globals precedence, depth-limited expansion with cycle detection, and reporting of missing/disabled/malformed references instead of silent substitution.
- Secret variables masked with `••••••••` in the UI and in exports; environment import/export.

**Testing**

- Declarative assertions only — no script execution: status code, response time, body (contains/equals/matches/exists…), header, JSON path.
- Extractions from JSON path / header / status into the active environment.
- Tests run automatically after each send, with run results in the response's **Tests** tab, plus a **Run history** table (manual/request/collection sources).

**History & settings**

- Automatic history recording with redacted sensitive headers and 64 KB body cap; search, method filter, status pills (2xx/3xx/4xx/5xx/Errors), re-run, cleanup and clear-all.
- Settings page: default response view, data statistics, **Reset history**, **Erase everything** (type-`ERASE` confirmation), security summary and About.

**Security & privacy**

- Local-first: JSON data in VS Code `globalStorage`, no cloud sync, no telemetry, no runtime dependencies.
- Secrets stored only in VS Code SecretStorage (opaque ids everywhere else); masking on save, on display and in logs.
- Strict webview CSP (`default-src 'none'`, per-load nonce) and `textContent`-only rendering.
- Field-by-field message validation on the host; input sanitization and size caps on every boundary.
- URL policy (http/https only, no credentials in URL, private-network toggle, HTTPS→HTTP downgrade block), redirect re-validation with cross-origin `Authorization`/`Cookie` stripping, header sanitization (CR/LF/NUL, forbidden hop-by-hop headers).
- Configurable policy: `greedcon.request.*`, `greedcon.security.*`, `greedcon.history.*`, `greedcon.storage.autoBackup`, `greedcon.logging.level`.

**Platform**

- Sidebar webview with seven pages (Welcome, Requests, Collections, Environments, History, Tests, Settings), also openable as an editor tab.
- Commands and keybindings (`Ctrl+Shift+G`, `Ctrl+Shift+N`), demo-data seeding, redacting output-channel logger.
- Storage with schema versioning (v2), v1→v2 migration, atomic writes, corruption quarantine with backup recovery and rotating/manual backups.

**Tooling**

- esbuild bundling (`dist/extension.js`, `media/webview.js`, `media/webview.css`), watch mode, dual TypeScript typecheck, Prettier configuration, Vitest test suite (unit + loopback integration).
