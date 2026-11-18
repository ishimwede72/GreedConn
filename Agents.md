[Image 1] # GREEDCON — MASTER SOFTWARE ENGINEERING PROMPT

## PROJECT IDENTITY

**Project Name:** GREEDCON\
**Project Type:** Professional Visual Studio Code API Testing Extension\
**Category:** Developer Tools / API Client / HTTP Testing Platform\
**Primary Language:** TypeScript\
**Frontend:** HTML5, CSS3, JavaScript/TypeScript\
**Runtime:** Node.js and VS Code Extension API\
**Target Platform:** Visual Studio Code\
**Primary Architecture:** Local-first, modular, extensible\
**Design Direction:** Professional dark UI with purple accents\
**Final Deliverable:** Complete, tested, installable `.vsix` extension

---

# 1. YOUR ROLE

You are acting as a complete senior software engineering team.

Your responsibilities include:

1. Senior TypeScript engineer.
2. VS Code extension architect.
3. Frontend UI/UX engineer.
4. HTTP networking engineer.
5. API testing engineer.
6. Application security engineer.
7. Database and storage engineer.
8. Quality assurance engineer.
9. Technical documentation engineer.
10. Release and packaging engineer.

Your assignment is to design, implement, test, document, and package a professional VS Code extension named GREEDCON.

Do not create a simple demonstration or a collection of disconnected interface mockups.

Build a real, functional, maintainable application.

You must take responsibility for the entire implementation, from project initialization to final VSIX packaging.

---

# 2. PROJECT OBJECTIVE

GREEDCON is a professional API development and testing platform integrated directly into Visual Studio Code.

It should provide an experience comparable to the core functionality of:

- Postman
- Thunder Client
- Insomnia

However, GREEDCON should have its own identity, architecture, interface, and implementation.

Users should be able to perform API development and testing without leaving VS Code.

The extension must support:

- HTTP request execution.
- Response inspection.
- Headers and query parameters.
- Request body management.
- Authentication.
- Collections.
- Environments.
- Variables.
- Automated tests.
- Request history.
- Import and export.
- Secure credential storage.
- Professional developer workflows.

The application must work locally.

**Do not introduce mandatory external APIs, paid services, hosted backends, subscriptions, or account registration.**

The extension should not require an internet connection to open its interface, manage local collections, or inspect previously saved requests. Network connectivity is required only when communicating with remote APIs or downloading optional resources.

---

# 3. DESIGN REFERENCE — FIVE MAIN PAGES

Use the five-page GREEDCON visual concept supplied in the conversation as the primary design reference.

Reproduce its overall visual identity and improve its usability where necessary.

## Page 1 — Welcome Dashboard

Create a professional landing page containing:

- GREEDCON logo and branding.
- Application title.
- Short product description.
- New Request button.
- Import Collection button.
- Quick Start section.
- Create New Request shortcut.
- Import from File shortcut.
- Explore Collections shortcut.
- View Request History shortcut.
- Application version.
- Useful keyboard shortcuts.
- Empty-state illustrations or icons.

The welcome screen must look professional rather than like a generic HTML form.

## Page 2 — New Request / Request Builder

Build a full-featured HTTP request editor.

The interface must contain:

- HTTP method selector.
- URL input.
- Send button.
- Cancel Request button when a request is running.
- Request tabs.
- Parameters editor.
- Headers editor.
- Body editor.
- Authentication editor.
- Tests editor.
- Request settings.

Supported HTTP methods:

- GET
- POST
- PUT
- PATCH
- DELETE
- HEAD
- OPTIONS

Query parameter editor:

- Key.
- Value.
- Description.
- Enable/disable parameter.
- Add parameter.
- Delete parameter.

Headers editor:

- Header name.
- Header value.
- Enable/disable header.
- Add header.
- Remove header.

Body editor:

- None.
- JSON.
- Raw text.
- Form URL encoded.
- Multipart form data.
- XML.
- Text.

Add JSON formatting and validation.

Preserve request configuration when switching between tabs.

## Page 3 — Response Viewer

Create a professional response inspection interface.

Display:

- HTTP status code.
- Status description.
- Response time.
- Response size.
- Response body.
- Response headers.
- Cookies.
- Test results.

Response viewing modes:

- Pretty.
- Raw.
- Preview.

Support:

- JSON syntax highlighting.
- JSON formatting.
- XML formatting where possible.
- Text responses.
- HTML preview with appropriate sandboxing.
- Binary response metadata.
- Copy response.
- Search response.
- Download response.
- Collapse and expand JSON nodes.

Handle empty responses, invalid JSON, large responses, and network errors gracefully.

## Page 4 — Collections Manager

Create a complete collection management system.

Users must be able to:

- Create collections.
- Rename collections.
- Delete collections.
- Duplicate collections.
- Create folders.
- Rename folders.
- Delete folders.
- Move requests between folders.
- Save requests.
- Edit saved requests.
- Duplicate requests.
- Delete requests.
- Search collections.
- Export collections.
- Import collections.

Use a structured local data model.

Support importing and exporting a documented GREEDCON collection format.

Provide an extensible importer architecture for Postman Collection v2.1 and other compatible formats.

Never silently discard unsupported imported data.

## Page 5 — Environments and Testing

Build an environment management and API testing interface.

Environment features:

- Create environment.
- Rename environment.
- Delete environment.
- Select active environment.
- Create variables.
- Edit variables.
- Delete variables.
- Mask sensitive values.
- Support global variables.
- Support environment-specific variables.

Example variables:

{{base_url}}
{{api_token}}
{{user_id}}
{{version}}

Variable resolution must occur safely before request execution.

Testing features:

- HTTP status assertions.
- Response time assertions.
- Response body assertions.
- JSON path assertions.
- Header assertions.
- Variable extraction.
- Test execution.
- Test results.
- Pass/fail indicators.
- Test execution history.

Example tests:

- Status code equals 200.
- Response time is below 1000 ms.
- Response contains a specified property.
- JSON field has an expected value.
- Response header exists.

Display a professional test result summary.

---

# 4. DESIGN SYSTEM

Follow the generated GREEDCON design direction.

## Visual identity

Primary background: very dark charcoal.

Secondary background: dark gray.

Primary accent: purple/violet.

Success: green.

Warning: amber.

Error: red.

Text: white and light gray.

Use consistent spacing, typography, borders, shadows, and hover effects.

## Interface requirements

- Dark theme by default.
- Purple accent buttons.
- Professional sidebar navigation.
- Responsive layout.
- Consistent icons.
- Smooth transitions.
- Clear active navigation states.
- Professional empty states.
- Loading indicators.
- Error notifications.
- Confirmation dialogs for destructive actions.
- Keyboard navigation.
- Accessible contrast.
- Tooltips for important controls.

The UI must feel like a real developer application.

Avoid excessive gradients, unnecessary animations, oversized cards, and inconsistent component styles.

Respect VS Code theme integration where practical.

Do not rely on remote fonts or externally hosted assets for the core interface.

## Navigation

Provide the following navigation:

1. Welcome.
2. Requests.
3. Collections.
4. Environments.
5. History.
6. Tests.
7. Settings.

Use one consistent navigation system across all pages.

---

# 5. TECHNOLOGY STACK

Use the following technologies unless a technical incompatibility requires a documented alternative.

## Extension backend

- TypeScript.
- Node.js.
- VS Code Extension API.

## Frontend

- HTML5.
- CSS3.
- TypeScript or JavaScript.
- VS Code Webview API.

## Networking

Use a reliable HTTP networking implementation.

Axios or Node.js native networking may be used.

Choose one primary networking implementation and avoid unnecessary duplication.

The request engine must support:

- Request timeout.
- Request cancellation.
- Response parsing.
- Response headers.
- HTTP error handling.
- Redirect handling.
- Request size controls.
- Response size controls.
- Network failure handling.

## Storage

Use:

- VS Code ExtensionContext.globalStorageUri for application data.
- VS Code SecretStorage for credentials and sensitive tokens.
- A modular storage abstraction.

Begin with a reliable JSON-based storage implementation.

Keep the architecture ready for SQLite as an optional future storage adapter.

Do not introduce SQLite merely for architectural appearance if it adds unnecessary dependencies or complexity.

## Build tools

- npm.
- TypeScript compiler.
- esbuild where appropriate.
- ESLint.
- Prettier.
- VS Code Extension Test Runner.
- @vscode/vsce for packaging.

Use stable, compatible dependencies and commit a package-lock.json.

---

# 6. REQUIRED PROJECT STRUCTURE

Create a clean, modular project.

The following is the intended architecture. You may add files where technically necessary, but do not omit important functionality or create empty placeholder files.

GREEDCON/

├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── test.yml
│       └── release.yml
│
├── .vscode/
│   ├── extensions.json
│   ├── launch.json
│   ├── settings.json
│   └── tasks.json
│
├── resources/
│   ├── icons/
│   │   ├── greedcon.svg
│   │   ├── greedcon-dark.svg
│   │   ├── greedcon-light.svg
│   │   └── activity-icon.svg
│   │
│   ├── illustrations/
│   │   ├── welcome.svg
│   │   ├── empty-collections.svg
│   │   └── empty-response.svg
│   │
│   └── assets/
│
├── src/
│   │
│   ├── extension.ts
│   ├── constants.ts
│   ├── configuration.ts
│   │
│   ├── commands/
│   │   ├── index.ts
│   │   ├── openGreedcon.ts
│   │   ├── newRequest.ts
│   │   ├── saveRequest.ts
│   │   ├── importCollection.ts
│   │   ├── exportCollection.ts
│   │   ├── openHistory.ts
│   │   ├── runTests.ts
│   │   └── openSettings.ts
│   │
│   ├── providers/
│   │   ├── GreedconViewProvider.ts
│   │   ├── GreedconPanelProvider.ts
│   │   ├── GreedconTreeProvider.ts
│   │   ├── CollectionsTreeProvider.ts
│   │   ├── EnvironmentsTreeProvider.ts
│   │   └── HistoryTreeProvider.ts
│   │
│   ├── messaging/
│   │   ├── MessageRouter.ts
│   │   ├── MessageTypes.ts
│   │   ├── MessageValidator.ts
│   │   └── MessageHandlers.ts
│   │
│   ├── engine/
│   │   ├── HttpClient.ts
│   │   ├── RequestExecutor.ts
│   │   ├── RequestBuilder.ts
│   │   ├── ResponseParser.ts
│   │   ├── ResponseFormatter.ts
│   │   ├── HeaderManager.ts
│   │   ├── QueryManager.ts
│   │   ├── BodyManager.ts
│   │   ├── RequestValidator.ts
│   │   ├── CancellationManager.ts
│   │   ├── TimeoutManager.ts
│   │   └── NetworkErrorHandler.ts
│   │
│   ├── authentication/
│   │   ├── AuthenticationManager.ts
│   │   ├── BearerAuth.ts
│   │   ├── BasicAuth.ts
│   │   ├── ApiKeyAuth.ts
│   │   ├── OAuth2Auth.ts
│   │   └── CredentialStore.ts
│   │
│   ├── collections/
│   │   ├── CollectionManager.ts
│   │   ├── CollectionRepository.ts
│   │   ├── FolderManager.ts
│   │   ├── RequestRepository.ts
│   │   ├── CollectionImporter.ts
│   │   ├── CollectionExporter.ts
│   │   ├── CollectionValidator.ts
│   │   └── formats/
│   │       ├── GreedconFormat.ts
│   │       ├── PostmanImporter.ts
│   │       └── ImportFormatRegistry.ts
│   │
│   ├── environments/
│   │   ├── EnvironmentManager.ts
│   │   ├── EnvironmentRepository.ts
│   │   ├── VariableResolver.ts
│   │   ├── VariableValidator.ts
│   │   └── VariableMasker.ts
│   │
│   ├── history/
│   │   ├── HistoryManager.ts
│   │   ├── HistoryRepository.ts
│   │   ├── HistorySearch.ts
│   │   └── HistoryCleanup.ts
│   │
│   ├── testing/
│   │   ├── TestRunner.ts
│   │   ├── TestAssertion.ts
│   │   ├── TestParser.ts
│   │   ├── TestContext.ts
│   │   ├── TestResult.ts
│   │   ├── TestReporter.ts
│   │   └── assertions/
│   │       ├── StatusAssertion.ts
│   │       ├── ResponseTimeAssertion.ts
│   │       ├── BodyAssertion.ts
│   │       ├── HeaderAssertion.ts
│   │       └── JsonPathAssertion.ts
│   │
│   ├── storage/
│   │   ├── StorageProvider.ts
│   │   ├── StorageManager.ts
│   │   ├── JsonStorage.ts
│   │   ├── StorageMigration.ts
│   │   ├── BackupManager.ts
│   │   └── repositories/
│   │       ├── CollectionStorage.ts
│   │       ├── EnvironmentStorage.ts
│   │       ├── HistoryStorage.ts
│   │       └── SettingsStorage.ts
│   │
│   ├── security/
│   │   ├── SecurityManager.ts
│   │   ├── SecretManager.ts
│   │   ├── InputSanitizer.ts
│   │   ├── UrlValidator.ts
│   │   ├── HeaderSanitizer.ts
│   │   ├── WebviewSecurity.ts
│   │   └── RedactionManager.ts
│   │
│   ├── utils/
│   │   ├── Logger.ts
│   │   ├── ErrorUtils.ts
│   │   ├── JsonUtils.ts
│   │   ├── DateUtils.ts
│   │   ├── IdGenerator.ts
│   │   ├── FileUtils.ts
│   │   └── ValidationUtils.ts
│   │
│   └── types/
│       ├── Request.ts
│       ├── Response.ts
│       ├── Collection.ts
│       ├── Environment.ts
│       ├── History.ts
│       ├── Authentication.ts
│       ├── Testing.ts
│       ├── Storage.ts
│       └── Messages.ts
│
├── webview/
│   │
│   ├── index.html
│   ├── app.ts
│   ├── app.css
│   │
│   ├── components/
│   │   ├── Sidebar.ts
│   │   ├── Header.ts
│   │   ├── Button.ts
│   │   ├── Modal.ts
│   │   ├── Tabs.ts
│   │   ├── Toast.ts
│   │   ├── Dropdown.ts
│   │   ├── DataTable.ts
│   │   ├── JsonViewer.ts
│   │   ├── CodeEditor.ts
│   │   └── LoadingIndicator.ts
│   │
│   ├── pages/
│   │   ├── WelcomePage.ts
│   │   ├── RequestPage.ts
│   │   ├── ResponsePage.ts
│   │   ├── CollectionsPage.ts
│   │   ├── EnvironmentPage.ts
│   │   ├── HistoryPage.ts
│   │   ├── TestsPage.ts
│   │   └── SettingsPage.ts
│   │
│   ├── services/
│   │   ├── VsCodeBridge.ts
│   │   ├── RequestService.ts
│   │   ├── CollectionService.ts
│   │   ├── EnvironmentService.ts
│   │   ├── HistoryService.ts
│   │   └── TestService.ts
│   │
│   ├── state/
│   │   ├── AppState.ts
│   │   ├── RequestState.ts
│   │   └── NavigationState.ts
│   │
│   ├── styles/
│   │   ├── variables.css
│   │   ├── reset.css
│   │   ├── layout.css
│   │   ├── sidebar.css
│   │   ├── buttons.css
│   │   ├── forms.css
│   │   ├── tables.css
│   │   ├── editor.css
│   │   ├── response.css
│   │   ├── collections.css
│   │   ├── environments.css
│   │   └── responsive.css
│   │
│   └── assets/
│       └── icons/
│
├── tests/
│   ├── unit/
│   │   ├── engine/
│   │   ├── authentication/
│   │   ├── collections/
│   │   ├── environments/
│   │   ├── storage/
│   │   ├── security/
│   │   └── testing/
│   │
│   ├── integration/
│   │   ├── request-flow.test.ts
│   │   ├── collection-flow.test.ts
│   │   ├── environment-flow.test.ts
│   │   └── message-flow.test.ts
│   │
│   ├── fixtures/
│   │   ├── sample-request.json
│   │   ├── sample-collection.json
│   │   └── sample-environment.json
│   │
│   └── mocks/
│       ├── vscode.mock.ts
│       └── network.mock.ts
│
├── docs/
│   ├── ARCHITECTURE.md
│   ├── INSTALLATION.md
│   ├── USER_GUIDE.md
│   ├── API_ENGINE.md
│   ├── SECURITY.md
│   ├── STORAGE.md
│   ├── TESTING.md
│   ├── CONTRIBUTING.md
│   └── ROADMAP.md
│
├── scripts/
│   ├── build.ts
│   ├── clean.ts
│   ├── package.ts
│   └── verify.ts
│
├── .gitignore
├── .npmrc
├── .vscodeignore
├── CHANGELOG.md
├── CODE_OF_CONDUCT.md
├── CONTRIBUTING.md
├── LICENSE
├── package.json
├── package-lock.json
├── README.md
├── SECURITY.md
├── tsconfig.json
├── esbuild.js
└── eslint.config.js

This is the target structure, not permission to generate empty files. Every implemented module must have a meaningful responsibility and working code.

If a file is unnecessary, explain why and document the architectural decision rather than creating a fake implementation.

---

# 7. IMPLEMENTATION PHASES

Implement the project in eight clearly separated phases.

Do not skip phases.

Do not mark a phase complete merely because its files exist.

A phase is complete only when its features work and its tests pass.

## PHASE 1 — FOUNDATION

Implement:

- VS Code extension activation.
- Extension manifest.
- GREEDCON activity bar integration.
- Main webview.
- Navigation.
- Message communication between webview and extension.
- Typed message contracts.
- Input validation.
- Logging.
- Error handling.
- Initial application state.
- Professional welcome page.

Acceptance criteria:

- Extension activates without errors.
- GREEDCON appears in VS Code.
- All main navigation items open the correct page.
- Webview and extension can exchange validated messages.
- CSP is configured correctly.
- No critical console errors.
- Application can be built and packaged.

## PHASE 2 — HTTP REQUEST ENGINE

Implement:

- Request construction.
- HTTP methods.
- URL validation.
- Query parameters.
- Headers.
- Request body.
- JSON support.
- Form URL encoding.
- Multipart support.
- Request execution.
- Request timeout.
- Cancellation.
- Response parsing.
- Response formatting.
- Response metadata.
- Error handling.

Acceptance criteria:

- Real HTTP requests execute successfully.
- GET and POST work.
- PUT, PATCH, DELETE, HEAD, and OPTIONS work.
- Query parameters are correctly encoded.
- Headers are correctly transmitted.
- JSON request bodies work.
- Response status, headers, body, and timing are displayed.
- Failed requests produce understandable errors.
- Cancellation actually stops supported in-flight requests.

## PHASE 3 — PROFESSIONAL USER INTERFACE

Implement all five visual reference pages.

Improve:

- Layout consistency.
- Responsive behavior.
- Sidebar navigation.
- Request editor.
- Response editor.
- JSON viewer.
- Collections interface.
- Environment interface.
- Loading states.
- Empty states.
- Toast notifications.
- Keyboard shortcuts.

Acceptance criteria:

- All screens are functional, not static mockups.
- All buttons perform their intended actions.
- UI state remains consistent during navigation.
- The application looks professional at typical VS Code window sizes.

## PHASE 4 — AUTHENTICATION AND SECURITY

Implement:

- Bearer token authentication.
- Basic authentication.
- API key authentication.
- OAuth 2.0 support.
- Secure credential storage.
- Credential masking.
- Variable masking.
- Header validation.
- URL validation.
- Webview security.
- Redacted logging.

OAuth 2.0 must use appropriate flows and avoid exposing client secrets or access tokens unnecessarily.

Do not store passwords, access tokens, refresh tokens, or API keys in plaintext collection files or request history.

Use VS Code SecretStorage for sensitive credentials.

Never log credentials.

Never expose secrets to error messages.

Implement security controls for:

- Untrusted URLs.
- Redirect behavior.
- Localhost and private network access.
- Unexpected protocols.
- Webview content.
- File access.
- Request body sizes.
- Response sizes.
- Malicious imported collection data.

Do not implement security controls that make legitimate local API testing impossible without a clear reason. Where appropriate, use configurable security policies and explain their implications.

## PHASE 5 — COLLECTIONS

Implement:

- Collection CRUD.
- Folder CRUD.
- Request CRUD.
- Request duplication.
- Request movement.
- Search.
- Import.
- Export.
- Persistence.
- Data validation.
- Data migration.

Postman Collection v2.1 import support is a priority.

Maintain GREEDCON's own versioned collection format.

Ensure import/export round trips preserve supported data.

## PHASE 6 — ENVIRONMENTS

Implement:

- Environment CRUD.
- Global variables.
- Environment-specific variables.
- Active environment.
- Variable resolution.
- Missing variable detection.
- Sensitive variable masking.
- Variable extraction.
- Environment persistence.

Support:

{{variable_name}}

Ensure variable substitution does not accidentally modify unrelated text.

Handle missing, circular, and malformed variable references safely.

## PHASE 7 — TESTING AND HISTORY

Implement:

- Request history.
- History search.
- History filtering.
- History cleanup.
- Automated assertions.
- Test execution.
- Test reporting.
- Response-time assertions.
- JSON path assertions.
- Header assertions.
- Status-code assertions.
- Test results persistence.

If scripting is introduced, use a restricted execution environment.

Do not execute arbitrary user-provided scripts directly inside the privileged extension host.

Document the limitations and security model of the test scripting environment.

## PHASE 8 — PRODUCTION AND RELEASE

Implement:

- Complete application integration.
- Final UI polishing.
- Performance optimization.
- Dependency audit.
- Security review.
- Unit tests.
- Integration tests.
- Build validation.
- Extension manifest validation.
- Documentation.
- Installation instructions.
- Release configuration.
- VSIX packaging.

Final acceptance criteria:

- No missing core functionality.
- No empty placeholder modules.
- No broken imports.
- No TypeScript compilation errors.
- No failing tests.
- No broken webview message handlers.
- No exposed credentials.
- No critical runtime errors.
- No unnecessary dependencies.
- VSIX package successfully generated.
- Installation and usage instructions provided.

---

# 8. HTTP ENGINE ARCHITECTURE

The HTTP engine is one of GREEDCON's most important components.

Keep it independent of the webview.

Use clear interfaces.

Suggested request model:

- id
- name
- method
- url
- params
- headers
- body
- authentication
- timeout
- environmentId
- createdAt
- updatedAt

Suggested response model:

- status
- statusText
- headers
- cookies
- body
- responseTime
- responseSize
- contentType
- error
- requestId

Use strongly typed TypeScript interfaces.

Keep request preparation, variable resolution, authentication, execution, response parsing, and history recording as separate responsibilities.

Avoid tightly coupling the UI to Axios or the selected networking library.

The networking implementation must support cancellation and sensible timeout behavior.

Do not silently convert HTTP errors into successful application results. Preserve HTTP response information even when the status code indicates failure.

---

# 9. STORAGE AND DATA INTEGRITY

All core data should be stored locally.

Use a clear storage hierarchy.

Suggested data:

- collections.json
- environments.json
- history.json
- settings.json

Store these files in the extension's designated global storage directory, not in the extension installation directory.

Sensitive credentials must be stored separately using VS Code SecretStorage.

Implement:

- Schema versioning.
- Validation.
- Atomic writes where practical.
- Backup and recovery.
- Corrupted file handling.
- Data migrations.
- Storage error reporting.

Never silently overwrite corrupted user data.

Use stable identifiers for collections, folders, requests, and environments.

---

# 10. WEBVIEW AND MESSAGE SECURITY

The webview is an untrusted boundary.

Use:

- Content Security Policy.
- Nonces for permitted scripts.
- Local resource roots.
- asWebviewUri.
- Validated message schemas.
- Explicit message handlers.
- Safe DOM rendering.
- Output escaping.
- No arbitrary HTML injection.
- No unnecessary remote scripts.
- No unrestricted eval.

The webview must never receive unnecessary secret material.

All messages must have typed payloads and explicit validation.

---

# 11. USER EXPERIENCE AND PRODUCT QUALITY

GREEDCON should feel like a mature developer tool.

Provide:

- Clear loading states.
- Clear success and error feedback.
- Confirmation for destructive actions.
- Keyboard shortcuts.
- Search.
- Context menus where appropriate.
- Copy actions.
- Save actions.
- Persistent workspaces.
- Useful tooltips.
- Accessible controls.
- Consistent typography.

Avoid:

- Fake buttons.
- Dead navigation links.
- Placeholder response data in production.
- Hardcoded sample results pretending to be real API responses.
- Repeated code.
- Giant monolithic TypeScript files.
- Unnecessary dependencies.
- Excessive global state.

The sample data must only appear in an explicitly identified demo or example context.

---

# 12. TESTING REQUIREMENTS

Create meaningful tests.

Test at least:

### HTTP engine
- Valid GET.
- Valid POST.
- Invalid URL.
- Timeout.
- Cancellation.
- Invalid JSON.
- Empty response.
- Non-2xx response.
- Header handling.
- Query encoding.

### Authentication
- Bearer token.
- Basic authentication.
- API key.
- Missing credentials.
- Secret masking.

### Collections
- Create.
- Update.
- Delete.
- Duplicate.
- Import.
- Export.
- Invalid import.
- Data migration.

### Environments
- Variable resolution.
- Missing variables.
- Sensitive variable masking.
- Malformed variables.

### Security
- Invalid protocols.
- Unsafe redirects.
- Header validation.
- Webview message validation.
- Secret redaction.
- Imported data validation.

### Integration
- Webview-to-extension messaging.
- Request execution.
- Response delivery.
- History recording.
- Collection persistence.

Use mocked network responses for deterministic automated tests.

Do not make the test suite depend on external public APIs being online.

---

# 13. DOCUMENTATION

Create professional documentation.

README.md must contain:

- GREEDCON introduction.
- Features.
- Screenshots section.
- Installation.
- Getting started.
- How to send requests.
- How to manage collections.
- How to configure environments.
- How to use authentication.
- How to execute tests.
- Storage behavior.
- Security notes.
- Development setup.
- Build commands.
- Test commands.
- Packaging instructions.
- Troubleshooting.
- Roadmap.

Also provide:

- ARCHITECTURE.md
- SECURITY.md
- USER_GUIDE.md
- INSTALLATION.md
- CONTRIBUTING.md
- CHANGELOG.md

Do not claim features are supported unless they have actually been implemented.

---

# 14. REQUIRED NPM COMMANDS

Provide appropriate package scripts, including:

- npm install
- npm run compile
- npm run watch
- npm run lint
- npm run format
- npm test
- npm run test:unit
- npm run test:integration
- npm run package
- npm run verify

The exact implementation may differ, but each documented command must actually work.

Provide a command to create the final VSIX package.

---

# 15. PERFORMANCE REQUIREMENTS

Keep the extension responsive.

Avoid blocking the VS Code extension host with long-running operations.

Use asynchronous operations.

Implement:

- Request cancellation.
- Reasonable response size limits.
- History limits.
- Efficient collection loading.
- Efficient search.
- Safe rendering of large JSON responses.
- Controlled logging.

Do not load unnecessary data into the webview.

Avoid expensive full-page rerenders for small state changes where practical.

---

# 16. IMPORTANT DEVELOPMENT RULES

These rules are mandatory.

1. Inspect the existing workspace before changing anything.
2. Preserve useful existing work.
3. Do not overwrite unrelated files.
4. Create the complete project structure.
5. Implement real functionality.
6. Use strict TypeScript wherever practical.
7. Avoid unnecessary any types.
8. Use reusable modules.
9. Separate frontend and backend responsibilities.
10. Validate all external inputs.
11. Handle errors explicitly.
12. Write tests alongside implementation.
13. Run the compiler after major changes.
14. Run tests after each phase.
15. Fix errors instead of hiding them.
16. Do not create empty placeholder files.
17. Do not claim tests passed unless they were executed.
18. Do not claim a feature is complete unless it works.
19. Do not leave fake implementations in the final release.
20. Do not stop after generating the folder structure.
21. Do not stop after creating the interface.
22. Do not stop after implementing the HTTP engine.
23. Continue until the complete extension is integrated and packaged.

If you encounter a technical limitation, explain it and implement the best secure alternative.

Do not ask me to manually create files that you can create yourself.

Do not repeatedly ask for permission to proceed with normal implementation tasks.

Make sensible engineering decisions independently and document significant decisions.

---

# 17. DEVELOPMENT WORKFLOW

Work systematically.

At the beginning:

1. Inspect the current directory.
2. Identify the operating system and available Node.js/npm versions.
3. Check whether the workspace already contains a project.
4. Inspect existing package dependencies.
5. Create an implementation plan.
6. Initialize or update the project without destroying useful work.

Then implement the eight phases.

For every phase:

1. Create the necessary files.
2. Implement the functionality.
3. Integrate it with existing modules.
4. Run TypeScript compilation.
5. Run relevant tests.
6. Fix all discovered errors.
7. Update documentation.
8. Update the project progress report.

Maintain:

docs/IMPLEMENTATION_STATUS.md

This file must record:

- Completed phases.
- In-progress phases.
- Pending features.
- Implemented files.
- Tests executed.
- Test results.
- Known issues.
- Architectural decisions.

Do not mark work complete based only on file creation.

---

# 18. FINAL RELEASE DELIVERABLES

The final workspace must include:

1. Complete GREEDCON source code.
2. Complete project folder structure.
3. Functional five-page user interface.
4. Functional HTTP request engine.
5. Authentication system.
6. Collections management.
7. Environment management.
8. Request history.
9. Automated testing system.
10. Local storage implementation.
11. Secure credential storage.
12. Unit tests.
13. Integration tests.
14. Documentation.
15. Build configuration.
16. Release configuration.
17. Installation instructions.
18. Final installable GREEDCON VSIX package.

The final VSIX should be generated in:

dist/greedcon.vsix

Use a versioned filename if necessary, but document the exact final location.

Also provide:

- Final project tree.
- Number of implemented source files.
- Number of tests executed.
- Test pass/fail summary.
- Build result.
- VSIX file size.
- Installation command.
- Known limitations.

---

# 19. FINAL VERIFICATION

Before declaring the project finished, verify the following.

[ ] Extension activates in VS Code.

[ ] GREEDCON appears in the activity bar.

[ ] Welcome page works.

[ ] Request builder works.

[ ] GET requests work.

[ ] POST requests work.

[ ] PUT requests work.

[ ] PATCH requests work.

[ ] DELETE requests work.

[ ] HEAD requests work.

[ ] OPTIONS requests work.

[ ] Parameters work.

[ ] Headers work.

[ ] JSON bodies work.

[ ] Authentication works.

[ ] Response viewer works.

[ ] JSON formatting works.

[ ] Collections persist.

[ ] Collection import works.

[ ] Collection export works.

[ ] Environments persist.

[ ] Variable substitution works.

[ ] Secrets are protected.

[ ] Request history works.

[ ] Automated tests execute.

[ ] Test results display correctly.

[ ] Settings work.

[ ] Errors are handled correctly.

[ ] TypeScript compilation succeeds.

[ ] Automated tests pass.

[ ] Extension package builds.

[ ] VSIX installation succeeds.

[ ] Documentation is complete.

Do not check an item unless it has been verified.

---

# 20. YOUR FINAL MISSION

Build GREEDCON as a real, polished, professional VS Code API testing extension.

The generated five-page design concept defines the visual direction.

The architecture in this specification defines the engineering direction.

The eight phases define the implementation roadmap.

The acceptance criteria define completion.

Your objective is not to produce a prototype.

Your objective is to deliver a functional, secure, well-structured, tested, documented, and installable extension.

Start by inspecting the workspace and establishing the project foundation.

Then implement the entire system phase by phase.

Do not stop at planning.

Do not stop at generating files.

Do not stop at a beautiful UI.

**Finish the working application, verify it, and produce the final GREEDCON VSIX package.**
