# Installation

## 1. Install from source

**Prerequisites**

- **VS Code `^1.85.0`** (the `engines.vscode` requirement in `package.json`)
- **Node.js 26 + npm** — the toolchain this project is developed and CI-tested with
- Git (to clone the repository)

```bash
git clone https://github.com/ishimwede72/GreedConn.git
cd GreedConn
npm ci          # installs exactly the locked devDependencies (no runtime deps)
npm run compile # builds dist/extension.js + media/webview.js + media/webview.css
```

`npm ci` installs **development** dependencies only (esbuild, TypeScript, ESLint, Prettier, Vitest, `@vscode/vsce`); the shipped extension has no runtime dependencies.

### Run without packaging (Extension Development Host)

1. Open the `GreedConn` folder in VS Code.
2. Press **F5** (_Run Extension_). The repository includes a launch configuration that compiles the extension and opens an Extension Development Host.
3. A second VS Code window opens with Greedcon activated; click the **Greedcon** icon in its Activity Bar.

Useful while developing: `npm run watch` (rebuild on change), then **Developer: Reload Window** in the development host.

### Install a packaged extension

```bash
npm run package                 # project script (scripts/package.ts) → dist/greedcon.vsix
code --install-extension dist/greedcon.vsix
```

Packaging manually with `npx vsce package` instead writes `greedcon-1.0.0.vsix` into the project root — the same install command works with the glob:

```bash
code --install-extension greedcon-*.vsix
```

The package includes the MIT license and a 128×128 PNG app icon derived from the SVG logo.

## 2. Development setup

| Command                                   | Purpose                                                                  |
| ----------------------------------------- | ------------------------------------------------------------------------ |
| `npm ci`                                  | Clean install of locked dev dependencies                                 |
| `npm run compile`                         | Production build (`scripts/build.ts`, also wired to `vscode:prepublish`) |
| `npm run watch`                           | Incremental esbuild watch (`esbuild.js --watch`)                         |
| `npm run build`                           | One-shot esbuild bundle (`esbuild.js`)                                   |
| `npm run clean`                           | Remove build output                                                      |
| `npm run typecheck`                       | `tsc --noEmit` for `tsconfig.json` **and** `tsconfig.webview.json`       |
| `npm run lint` / `npm run lint:fix`       | ESLint across the repo                                                   |
| `npm run format` / `npm run format:check` | Prettier write / check (`printWidth: 100`, single quotes)                |
| `npm test`                                | Full Vitest run (unit + integration)                                     |
| `npm run test:unit`                       | Unit tests only (`tests/unit`)                                           |
| `npm run test:integration`                | Integration tests only (`tests/integration`)                             |
| `npm run test:watch`                      | Vitest in watch mode                                                     |
| `npm run package`                         | Produce the `.vsix`                                                      |
| `npm run verify`                          | The project's verification script (`scripts/verify.ts`)                  |

Project layout in one line: sources in `src/` (extension host) and `webview/` (UI), tests in `tests/`, build entry `esbuild.js`, outputs `dist/` + `media/`.

## 3. Running tests

```bash
npm run test:unit         # fast, no network
npm run test:integration  # spawns local node:http servers on 127.0.0.1
npm test                  # everything
```

Details:

- The `vscode` module is aliased to `tests/mocks/vscode.mock.ts` (see `vitest.config.ts`), so the whole extension — handlers, storage, security — runs outside VS Code.
- **Integration tests never touch the real network**: they bind loopback (`127.0.0.1`) servers on ephemeral ports. No external endpoints are contacted.
- In CI (`process.env.CI`) Vitest also writes a JUnit report to `dist/test-results/junit.xml`.
- Timeouts are 20 s per test/hook.

## 4. Packaging a `.vsix`

```bash
npm run package      # → dist/greedcon.vsix (what CI uploads)
# or
npx vsce package     # → greedcon-1.0.0.vsix in the project root
```

What gets shipped is controlled by `.vscodeignore`: `dist/extension.js`, `media/`, `resources/`, `README.md`, `CHANGELOG.md`, and `LICENSE` are kept; sources, tests, docs, configs, and generated VSIX files are excluded.

Install and verify:

```bash
code --install-extension dist/greedcon.vsix   # or greedcon-*.vsix
code --list-extension | grep greedcon
```

Then reload VS Code and run **Greedcon: Open**.

## 5. Uninstall / cleanup

```bash
code --uninstall-extension GreedConn.greedcon
```

To remove Greedcon's data completely:

1. Delete the data directory (see §6): `collections.json`, `environments.json`, `history.json`, `settings.json`, `testRuns.json`, `backups/` and any `*.bak.N` / `*.corrupt.*` files.
2. Delete the `greedcon.secret.*` entries from VS Code's SecretStorage (they live in the OS credential store, not in the data directory). Clearing them is optional but recommended if you want the credentials gone — they are never written to disk by Greedcon.

## 6. Where data is stored

Everything is local, under VS Code's **global storage** directory for the extension id `GreedConn.greedcon` (publisher `GreedConn`, name `greedcon`):

| OS      | Path pattern                                                                |
| ------- | --------------------------------------------------------------------------- |
| Linux   | `~/.config/Code/User/globalStorage/GreedConn.greedcon/`                     |
| macOS   | `~/Library/Application Support/Code/User/globalStorage/GreedConn.greedcon/` |
| Windows | `%APPDATA%\Code\User\globalStorage\GreedConn.greedcon\`                     |

(For VS Code Insiders, `Code` becomes `Code - Insiders`; the exact location follows your VS Code data directory.)

Files inside:

| File                                     | Contents                                              |
| ---------------------------------------- | ----------------------------------------------------- |
| `collections.json`                       | Collections/folders/requests (schema v2 envelope)     |
| `environments.json`                      | Environments, global variables, active environment id |
| `history.json`                           | Recorded requests (redacted headers, capped bodies)   |
| `settings.json`                          | UI preferences, last page, current request draft      |
| `testRuns.json`                          | Test run history                                      |
| `backups/<timestamp>_<label>/`           | Full snapshots (incl. `pre-restore`)                  |
| `*.bak.1 … *.bak.3`, `*.manual.<ts>.bak` | Rotating per-file backups                             |
| `*.corrupt.<ts>`                         | Quarantined files that failed to parse                |

Secrets are **not** here — they are in VS Code SecretStorage.

The **Greedcon** output channel prints the exact directory on activation: `Greedcon is ready. Storage: <path>`.

## 7. Troubleshooting

**Packaging fails: invalid icon or missing license**
`npm run package` checks that `resources/icons/greedcon.png` is a valid PNG with dimensions of at least 128×128 and that the MIT `LICENSE` file is present. Restore those project assets if they were removed.

**Blank webview / “webview could not be loaded”**
The webview loads `media/webview.js` + `media/webview.css`. Run `npm run build` (or `npm run compile`) so those files exist, then **Developer: Reload Window**. The CSP allows scripts only from the webview's own resource source with a per-load nonce — hand-edited HTML will not run.

**Requests to `localhost`/private IPs are refused by Greedcon**
Check `greedcon.security.allowPrivateNetwork` (default `true`). If it is `false`, loopback/private targets are blocked by policy.

**`self-signed certificate` / `UNABLE_TO_VERIFY_LEAF_CERTIFICATE`**
Set `greedcon.request.validateSsl` to `false` for local development servers only.

**`ECONNREFUSED`, `EACCES` or firewall errors**
The server isn't listening on that port, another process holds it, or a local firewall blocks it. Greedcon connects directly from your machine (there is no proxy configuration); check the URL, port and that the server binds to an interface you can reach (`127.0.0.1` vs `0.0.0.0`).

**Requests time out**
Default timeout is `greedcon.request.timeout` (30 s, range 100–600000 ms). Raise it for slow endpoints; the response area shows the timeout as an error chip (`ETIMEDOUT`).

**Port conflicts during OAuth2 Authorization Code + PKCE**
The loopback callback listener uses ports 53000–53999; if those are blocked, use the Client Credentials grant or allow the range through your firewall.

**`npm run verify` fails**
The verification script prints the first failed step. Run that step by itself (`npm run typecheck`, `npm run lint`, `npm test`, `npm run compile`, or `npm run package`) to see the focused diagnostics.
