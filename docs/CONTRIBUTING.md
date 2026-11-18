# Contributing

Thanks for helping improve Greedcon. This document covers local setup, code style, test conventions and the three most common extension points.

## 1. Setup

```bash
npm ci
npm run typecheck   # must be clean before you start
npm run test:unit   # sanity check
npm run build       # bundle extension + webview
```

You need Node.js 26 and VS Code `^1.85.0` (see [INSTALLATION.md](./INSTALLATION.md)). Press **F5** in VS Code to launch an Extension Development Host for manual testing.

## 2. Code style

- **TypeScript, `strict: true`** for both configs (`tsconfig.json` for host/tests/scripts, `tsconfig.webview.json` for the webview). `npm run typecheck` runs both and must pass.
- **Prettier** (`.prettierrc.json`): single quotes, semicolons, trailing commas, `printWidth: 100`, 2-space indent, LF endings. Run `npm run format` before committing; CI-style checking is `npm run format:check`.
- **ESLint** flat config (`eslint.config.js`): `npm run lint`, autofix with `npm run lint:fix`.
- **Style conventions observed in the codebase:**
  - One class/module per file with a header comment explaining *why* it exists.
  - Optional properties are written as `...(value ? { key: value } : {})` when building objects (keeps `exactOptionalPropertyTypes`-style code honest and avoids `undefined` keys in JSON).
  - Prefer returning structured results (`{ ok, error }`, `issues[]`) over throwing for expected failures; throw for programmer/usage errors.
  - No new runtime dependencies — the shipped extension is dependency-free; everything must come from `node:` built-ins or be written in-repo.
  - Never log or persist secrets: use `logger` (it redacts) and SecretStorage ids, not values.

## 3. Test conventions

| Kind | Location | Rules |
| --- | --- | --- |
| Unit | `tests/unit/**` | Pure modules; fast; no filesystem writes outside temp dirs; no network |
| Integration | `tests/integration/**` | May wire real services together; **loopback only** — spawn `node:http` servers on `127.0.0.1` with ephemeral ports; never contact external hosts |
| Mocks | `tests/mocks/vscode.mock.ts` | The `vscode` module is aliased to this mock in `vitest.config.ts`, so tests run outside VS Code |

- Name files `<subject>.test.ts` under a folder mirroring `src/` (`tests/unit/security/urlValidator.test.ts` ↔ `src/security/UrlValidator.ts`).
- Run `npm run test:unit` while iterating, `npm test` before pushing (unit + integration).
- When you change behavior that the docs describe, update the matching doc in the same PR.

## 4. Extension point: adding a message handler

Messages are the only way the webview can act. To add one:

1. **Declare the payload** in `WebviewMessageMap` in `src/types/Messages.ts`:
   ```ts
   'things.list': { limit?: number };
   ```
2. **Allow-list the type** by appending it to `MESSAGE_TYPES` in `src/messaging/MessageTypes.ts` — without this, `MessageValidator` rejects the message with `INVALID_MESSAGE`.
3. **Validate it** by adding a `case 'things.list':` to `validatePayload()` in `src/messaging/MessageValidator.ts` (types + size caps; unknown types fall through to `fail('unhandled message type')`).
4. **Implement it** in `MessageHandlers.register()` (`src/messaging/MessageHandlers.ts`):
   ```ts
   r.register('things.list', async (payload: { limit?: number }) => ({ things: await s.things.list(payload) }));
   ```
   Handlers receive a *validated* payload and must return plain serializable data — never secrets.
5. **Call it** from the webview through `bridge.request('things.list', { limit })` (add a typed wrapper in `webview/services/` if it is reused).
6. If the host should push updates, add an event name + payload to `WebviewEventMap` and emit it with `services.broadcast(...)` / `emit(...)`.
7. Cover it: a validator unit test plus a handler test (storage-backed tests can use the `vscode` mock).

## 5. Extension point: adding an assertion type

Tests are declarative; adding an assertion never means adding script execution.

1. **Model** — add an interface and include it in the `AssertionDefinition` union in `src/types/Testing.ts`:
   ```ts
   export interface CookieAssertion { type: 'cookie'; operator: 'exists' | 'equals'; value?: string }
   ```
2. **Evaluator** — create `src/testing/assertions/CookieAssertion.ts` exporting `evaluateCookie(assertion, response): AssertionResult` (use `operatorLabel`, `failed`, `safeRegex`, `withType` from `assertions/shared.ts` for consistent descriptions and bounded regexes).
3. **Dispatch** — handle the new `type` in `evaluateAssertion()` (`src/testing/TestAssertion.ts`); the `never` exhaustiveness check will force you to.
4. **Parsing** — accept it in `parseAssertion()` (`src/testing/TestParser.ts`) so imports, storage and the UI all normalize it; invalid input must produce a warning, not a throw.
5. **UI** — in `webview/pages/TestsPage.ts`: add the type to the `Add assertion` picker in `addAssertion()`, extend `OPERATORS_BY_TYPE`, and describe it in `describeAssertion()`.
6. **Tests** — add `tests/unit/testing/<name>Assertion.test.ts` covering pass/fail/edge cases (missing header, bad regex, non-JSON body).

Extractions follow the same pattern through `ExtractDefinition` and `TestRunner.runExtraction()`.

## 6. Extension point: adding an import format

1. **Implement `ImportFormat`** in `src/collections/formats/<Name>.ts`:
   ```ts
   export interface ImportFormat {
     id: string; displayName: string; extensions: string[];
     detect(content: string): boolean;   // cheap, must not throw
     parse(content: string): ImportResult; // throw a descriptive Error on failure
   }
   ```
   Look at `PostmanImporter.ts` for the mapping style (never silently discard unknown data — preserve it and report warnings).
2. **Register it** with `importRegistry.register({...})` at the bottom of `src/collections/formats/ImportFormatRegistry.ts`. Registration order is detection order: native formats must be registered before generic ones.
3. **File picker** — if the format uses a new extension, add it to the `filters` map in `MessageHandlers.pickImportFile()` (and to the webview-side picker if applicable).
4. **Exporting** (optional) — `CollectionExporter` currently serializes only the native `greedcon-collection` format; add a branch in `export()` and list it in `supportedFormats()`.
5. **Tests** — fixture-based unit tests under `tests/unit/collections/` (valid file, malformed file, unknown fields, oversized input).

## 7. PR checklist

- [ ] `npm run typecheck` passes (both tsconfigs)
- [ ] `npm run lint` and `npm run format:check` pass
- [ ] `npm test` passes (unit **and** integration; integration stays loopback-only)
- [ ] New behavior has tests; bug fixes have a regression test
- [ ] No secrets, tokens or real endpoints committed in fixtures (use `example.com` / `127.0.0.1`)
- [ ] No new runtime dependencies; no `innerHTML`/`eval`/script execution in the webview
- [ ] Docs updated where behavior changed (`docs/`, `CHANGELOG.md` under *Unreleased*)
- [ ] `package.json` untouched unless the PR is about scripts/metadata
- [ ] The change is described clearly: what, why, how it was verified
