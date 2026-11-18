# Implementation status

## Scope

Greedcon is implemented as a VS Code extension with a TypeScript extension host and a TypeScript webview. The source tree contains the request engine, authentication, storage, security controls, collection and environment managers, test runner, message protocol, seven UI pages, and supporting tests.

## Phases

| Phase                         | Status   | Evidence                                                                                                                                                    |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation and build          | Complete | Extension activation, storage, service wiring, webview host, and esbuild pipeline are present.                                                              |
| HTTP request engine           | Complete | HTTP/HTTPS methods, request validation, body and header assembly, timeout, cancellation, redirect policy, response parsing, and formatting are implemented. |
| User interface                | Complete | Welcome, Requests, Collections, Environments, History, Tests, and Settings pages are wired to the extension host.                                           |
| Authentication and security   | Complete | Bearer, Basic, API key, OAuth 2.0, SecretStorage, URL/header checks, webview CSP, and redaction are implemented.                                            |
| Collections and import/export | Complete | Recursive collection models, native Greedcon format, Postman v2.1 import, export, and collection test runs are implemented.                                 |
| Environments                  | Complete | Global and environment variables, validation, secret masking, precedence, and import/export are implemented.                                                |
| Tests and history             | Complete | Declarative assertions and extractions, per-request and collection runs, redacted history, search, retention, and replay are implemented.                   |
| Release and packaging         | Complete | VS Code launch configuration, CI workflow, MIT license, extension icon, package script, and install documentation are included.                             |

## Implemented areas

- `src/`: activation, services, commands, providers, request execution, authentication, collections, environments, storage, messaging, history, security, and declarative tests.
- `webview/`: application state, VS Code bridge, reusable components, seven pages, and responsive styles.
- `tests/`: unit and integration coverage for the engine, storage-facing flows, messaging, security, import/export, environments, history, and tests.
- `scripts/`: build, cleanup, packaging, and verification entry points.
- `.github/workflows/ci.yml`: CI runs the verification gate and publishes the VSIX as a build artifact.

## Verification

Final verification was run on 2026-11-18 with Node.js 26.13.1 using `npm run verify`:

- TypeScript checks for extension, tests, scripts, and webview: passed.
- ESLint: passed with 0 errors and 60 warnings.
- Automated tests: 466 passed across 26 test files.
- Production build: passed (`dist/extension.js`, `media/webview.js`, and `media/webview.css`).
- VSIX package: passed; `dist/greedcon.vsix` is 95,404 bytes (about 93.2 KiB).
- VSIX archive integrity: passed; 16 files are packaged, including the compiled extension, webview assets, icon, and license.
- VS Code Extension Development Host: launched with Greedcon loaded in development mode; the sidebar webview was not opened to confirm rendered UI.

## Known limitations

- The main view still needs an interactive check inside the VS Code Extension Development Host.
- OAuth 2.0 behavior depends on the authorization server and the local callback port range `53000–53999` being available.
- HTTP requests are executed directly by the extension host; system proxy configuration is not applied.

## Architectural decisions

- Request execution stays in the extension host and uses Node's built-in HTTP and HTTPS modules.
- Webview messages are validated on the host; user-authored tests are declarative and never evaluated as code.
- Collections, environments, settings, history, and test runs use local JSON storage. Credentials use VS Code SecretStorage.
- The release package bundles the extension and webview and has no runtime npm dependencies.
