# Greedcon

Greedcon is an API client for Visual Studio Code. Build and send HTTP requests, inspect responses, organize collections, manage environments, and run repeatable tests without leaving your editor.

## Install

In VS Code, open **Extensions** (Ctrl+Shift+X / Cmd+Shift+X) and search for **Greedcon** by **GreedConn**.

To install a VSIX file, open the Extensions view, choose **… → Install from VSIX…**, and select the downloaded .vsix.

## Get started

1. Open Greedcon from the Activity Bar, or run **Greedcon: Open** from the Command Palette.
2. Choose **Load demo data** on the Welcome page to explore a sample collection and environment.
3. Open **Requests**, select an HTTP method, enter a URL, and press **Send**. Use {{variable}} in request fields to insert environment values.
4. Review the response status, time, size, headers, and body. Failed HTTP statuses and network errors include an explanation; expand **Show full error details** to inspect the sanitized diagnostic log.
5. Save requests into collections and add declarative checks on the **Tests** page.

## What you can do

- Send GET, POST, PUT, PATCH, DELETE, HEAD, and OPTIONS requests.
- Edit query parameters, headers, JSON, text, XML, URL encoded forms, and multipart forms.
- Authenticate with Bearer, Basic, API key, and OAuth 2.0.
- Store reusable values in global or per-environment variables, including masked secrets.
- Organize requests into nested collection folders and import Postman Collection v2.1 files.
- Assert response status, time, body, headers, and JSON paths; extract response values into environments.
- Search and replay request history, inspect saved test runs, and copy response bodies.
- Choose Pretty, Raw, or Preview as the default response view in Settings.

## Privacy

Greedcon runs requests from the VS Code extension host. Collections, environments, settings, and history stay in VS Code local storage; credentials are stored in VS Code SecretStorage. The extension does not provide cloud sync or telemetry. Request data is sent only to the URL you choose.

Use **Settings → Erase everything** to remove Greedcon data, including saved credentials. VS Code settings such as request timeout and history behavior can be changed through **Greedcon: Open Settings**.

## Commands

- **Greedcon: Open** — open the Greedcon sidebar.
- **Greedcon: New Request** — start a request.
- **Greedcon: Open in Editor Tab** — open Greedcon in a larger editor tab.
- **Greedcon: Import Collection**, **Export Collection**, **Open History**, **Run Tests**, and **Clear History** — available from the Command Palette.

Default shortcuts: Ctrl+Shift+G / Cmd+Shift+G to open Greedcon, and Ctrl+Shift+N / Cmd+Shift+N for a new request.

## Help and documentation

For a walkthrough, see the [User Guide](docs/USER_GUIDE.md). For data handling, see [Security](docs/SECURITY.md). Report issues or request features in the [GreedConn GitHub repository](https://github.com/ishimwede72/GreedConn/issues).
