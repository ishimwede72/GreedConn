/**
 * In-memory `vscode` API mock.
 *
 * Aliased to the module id `vscode` by vitest.config.ts so the entire
 * extension (handlers, storage, security, commands) can run outside VS Code.
 *
 * The mock is intentionally permissive: configuration values can be
 * overridden per test through `setConfig`, and messages shown through the
 * window API are captured for assertions.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type DisposableLike = { dispose(): void };

class Disposable implements DisposableLike {
  constructor(private readonly fn?: () => void) {}
  dispose(): void {
    this.fn?.();
  }
  static from(...items: Array<DisposableLike | { dispose(): void }>): Disposable {
    return new Disposable(() => {
      for (const item of items) item.dispose();
    });
  }
}

class EventEmitter<T> {
  private readonly listeners: Array<(e: T) => void> = [];
  readonly event = (listener: (e: T) => void): Disposable => {
    this.listeners.push(listener);
    return new Disposable(() => {
      const index = this.listeners.indexOf(listener);
      if (index >= 0) this.listeners.splice(index, 1);
    });
  };
  fire(event: T): void {
    for (const listener of [...this.listeners]) listener(event);
  }
  dispose(): void {
    this.listeners.length = 0;
  }
}

class Uri {
  readonly scheme: string;
  readonly path: string;
  readonly query: string;
  readonly fragment: string;

  constructor(scheme: string, path: string, query = '', fragment = '') {
    this.scheme = scheme;
    this.path = path;
    this.query = query;
    this.fragment = fragment;
  }

  get fsPath(): string {
    return this.scheme === 'file' ? this.path : `/${this.scheme}${this.path}`;
  }

  get authority(): string {
    return '';
  }

  toString(): string {
    const query = this.query ? `?${this.query}` : '';
    const fragment = this.fragment ? `#${this.fragment}` : '';
    return `${this.scheme}://${this.path}${query}${fragment}`;
  }

  with(change: Partial<{ scheme: string; path: string; query: string; fragment: string }>): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    );
  }

  static file(path: string): Uri {
    return new Uri('file', path);
  }

  static parse(value: string): Uri {
    const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):\/\/([^?#]*)(\?[^#]*)?(#.*)?$/.exec(value);
    if (!match) return new Uri('file', value);
    const query = (match[3] ?? '').replace(/^\?/, '');
    const fragment = (match[4] ?? '').replace(/^#/, '');
    return new Uri(match[1], match[2], query, fragment);
  }

  static joinPath(base: Uri, ...parts: string[]): Uri {
    const segments = [base.path, ...parts].join('/').replace(/\/+/g, '/');
    return new Uri(base.scheme, segments);
  }
}

class ThemeIcon {
  constructor(
    readonly id: string,
    readonly color?: unknown,
  ) {}
}

class ThemeColor {
  constructor(readonly id: string) {}
}

class TreeItem {
  label?: string;
  id?: string;
  description?: string | boolean;
  tooltip?: string;
  contextValue?: string;
  iconPath?: unknown;
  command?: unknown;
  collapsibleState?: number;
  resourceUri?: Uri;

  constructor(label?: string, collapsibleState?: number) {
    this.label = label;
    this.collapsibleState = collapsibleState;
  }
}

const TreeItemCollapsibleState = { None: 0, Collapsed: 1, Expanded: 2 } as const;
const ViewColumn = { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3 } as const;
const ProgressLocation = { SourceControl: 1, Window: 10, Notification: 15 } as const;
const ExtensionMode = { Production: 1, Development: 2, Test: 3 } as const;

/** Configuration values set by tests (keyed `section.key`). */
const configValues = new Map<string, unknown>();

class WorkspaceConfiguration {
  constructor(private readonly section: string) {}

  get<T>(key: string, defaultValue?: T): T {
    const fullKey = `${this.section}.${key}`;
    return (configValues.has(fullKey) ? configValues.get(fullKey) : defaultValue) as T;
  }

  has(key: string): boolean {
    return configValues.has(`${this.section}.${key}`);
  }

  async update(key: string, value: unknown): Promise<void> {
    configValues.set(`${this.section}.${key}`, value);
  }

  inspect(key: string): unknown {
    const fullKey = `${this.section}.${key}`;
    if (!configValues.has(fullKey)) return undefined;
    const value = configValues.get(fullKey);
    return { key: fullKey, defaultValue: undefined, globalValue: value, workspaceValue: undefined };
  }

  onDidChange(): Disposable {
    return new Disposable();
  }
}

/** Messages surfaced through window.show* for assertions. */
interface WindowMessage {
  kind: 'error' | 'information' | 'warning';
  message: string;
  items?: string[];
}

const windowMessages: WindowMessage[] = [];
const registeredCommands = new Map<string, (...args: any[]) => unknown>();
const registeredTreeDataProviders = new Map<string, unknown>();
const registeredViewProviders = new Map<string, unknown>();
const outputLines: string[] = [];
const openedExternal: string[] = [];

/** Simple SecretStorage backed by a Map (mirrors the async contract). */
class SecretStorageMock {
  private readonly entries = new Map<string, string>();
  private readonly emitter = new EventEmitter<{ key: string; value?: string }>();

  async store(key: string, value: string): Promise<void> {
    this.entries.set(key, value);
    this.emitter.fire({ key, value });
  }

  async get(key: string): Promise<string | undefined> {
    return this.entries.get(key);
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
    this.emitter.fire({ key });
  }

  async keys(): Promise<string[]> {
    return [...this.entries.keys()];
  }

  onDidChange = this.emitter.event;

  /** Test helper: number of stored entries. */
  get size(): number {
    return this.entries.size;
  }
}

/** File system backed by a Map of path -> content (utf8 or bytes). */
const fileSystem = new Map<string, Uint8Array>();

const workspace = {
  getConfiguration(section?: string): WorkspaceConfiguration {
    return new WorkspaceConfiguration(section ?? '');
  },
  onDidChangeConfiguration(_listener: (e: unknown) => void): Disposable {
    return new Disposable();
  },
  workspaceFolders: [] as unknown[],
  fs: {
    async readFile(uri: Uri): Promise<Uint8Array> {
      const content = fileSystem.get(uri.fsPath);
      if (!content) {
        const error: any = new Error(`File not found: ${uri.fsPath}`);
        error.code = 'FileNotFound';
        throw error;
      }
      return content;
    },
    async writeFile(uri: Uri, content: Uint8Array): Promise<void> {
      fileSystem.set(uri.fsPath, new Uint8Array(content));
    },
    async delete(uri: Uri): Promise<void> {
      fileSystem.delete(uri.fsPath);
    },
    async stat(uri: Uri): Promise<{ type: number; size: number }> {
      const content = fileSystem.get(uri.fsPath);
      if (!content) {
        const error: any = new Error(`File not found: ${uri.fsPath}`);
        error.code = 'FileNotFound';
        throw error;
      }
      return { type: 1, size: content.byteLength };
    },
  },
};

const window = {
  showErrorMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    windowMessages.push({ kind: 'error', message, items });
    return Promise.resolve(undefined);
  },
  showInformationMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    windowMessages.push({ kind: 'information', message, items });
    return Promise.resolve(undefined);
  },
  showWarningMessage(message: string, ...items: string[]): Thenable<string | undefined> {
    windowMessages.push({ kind: 'warning', message, items });
    return Promise.resolve(undefined);
  },
  async showQuickPick<T extends { label: string }>(
    items: readonly T[],
    _options?: unknown,
  ): Promise<T | undefined> {
    return items[0];
  },
  async showInputBox(options?: { value?: string; prompt?: string }): Promise<string | undefined> {
    return options?.value ?? '';
  },
  async showOpenDialog(): Promise<Uri[] | undefined> {
    return undefined;
  },
  async showSaveDialog(options?: { defaultUri?: Uri }): Promise<Uri | undefined> {
    return options?.defaultUri;
  },
  createOutputChannel(name: string) {
    return {
      name,
      append(value: string): void {
        outputLines.push(value);
      },
      appendLine(value: string): void {
        outputLines.push(value);
      },
      clear(): void {
        outputLines.length = 0;
      },
      show(): void {},
      hide(): void {},
      dispose(): void {},
    };
  },
  createWebviewPanel(viewType: string, title: string) {
    return {
      viewType,
      title,
      webview: {
        html: '',
        options: {},
        cspSource: '',
        asWebviewUri: (uri: Uri) => uri,
        postMessage: () => Promise.resolve(true),
        onDidReceiveMessage: () => new Disposable(),
        onDidChangeViewState: () => new Disposable(),
      },
      onDidChangeViewState: () => new Disposable(),
      onDidDispose: () => new Disposable(),
      reveal(): void {},
      dispose(): void {},
    };
  },
  registerWebviewViewProvider(viewType: string, provider: unknown): Disposable {
    registeredViewProviders.set(viewType, provider);
    return new Disposable(() => registeredViewProviders.delete(viewType));
  },
  registerTreeDataProvider<T>(viewId: string, provider: unknown): Disposable {
    registeredTreeDataProviders.set(viewId, provider);
    return new Disposable(() => registeredTreeDataProviders.delete(viewId));
  },
  createStatusBarItem() {
    return {
      text: '',
      tooltip: '',
      show(): void {},
      hide(): void {},
      dispose(): void {},
    };
  },
  withProgress<R>(
    _options: unknown,
    task: (progress: { report(value: unknown): void }, token: unknown) => Thenable<R>,
  ): Thenable<R> {
    return task(
      { report: () => {} },
      { isCancellationRequested: false, onCancellationRequested: () => new Disposable() },
    );
  },
  activeTextEditor: undefined as unknown,
  onDidChangeActiveTextEditor: () => new Disposable(),
};

const commands = {
  registerCommand(id: string, callback: (...args: any[]) => unknown): Disposable {
    registeredCommands.set(id, callback);
    return new Disposable(() => registeredCommands.delete(id));
  },
  async executeCommand<T = unknown>(id: string, ...args: any[]): Promise<T> {
    const command = registeredCommands.get(id);
    if (command) return (await command(...args)) as T;
    // Commands registered by VS Code itself (e.g. workbench.action.openSettings)
    // are recorded and treated as successful no-ops in tests.
    return undefined as T;
  },
  getCommands(): Promise<string[]> {
    return Promise.resolve([...registeredCommands.keys()]);
  },
};

const env = {
  appName: 'Visual Studio Code',
  uriScheme: 'vscode',
  machineId: 'test-machine',
  sessionId: 'test-session',
  language: 'en',
  clipboard: {
    readText: async () => '',
    writeText: async () => undefined,
  },
  async openExternal(uri: Uri): Promise<boolean> {
    openedExternal.push(uri.toString());
    return true;
  },
  async openPath(): Promise<string> {
    return '';
  },
};

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Override a configuration value (e.g. `greedcon.request.timeout`). */
function setConfig(key: string, value: unknown): void {
  configValues.set(key, value);
}

/** Reset all mock state between tests. */
function reset(): void {
  configValues.clear();
  windowMessages.length = 0;
  registeredCommands.clear();
  registeredTreeDataProviders.clear();
  registeredViewProviders.clear();
  outputLines.length = 0;
  openedExternal.length = 0;
  fileSystem.clear();
}

export {
  Disposable,
  EventEmitter,
  Uri,
  TreeItem,
  ThemeIcon,
  ThemeColor,
  TreeItemCollapsibleState,
  ViewColumn,
  ProgressLocation,
  ExtensionMode,
  workspace,
  window,
  commands,
  env,
};

export const version = '1.146.0';

/** Test helpers (not part of the real API surface). */
export const __mock = {
  setConfig,
  reset,
  windowMessages,
  outputLines,
  openedExternal,
  fileSystem,
  registeredCommands,
  registeredTreeDataProviders,
  registeredViewProviders,
  createSecretStorage: (): SecretStorageMock => new SecretStorageMock(),
  createExtensionContext: (storagePath: string): any => ({
    subscriptions: [],
    globalStorageUri: Uri.file(storagePath),
    workspaceStorageUri: Uri.file(`${storagePath}-workspace`),
    extensionPath: storagePath,
    extensionUri: Uri.file(storagePath),
    extension: { id: 'GreedConn.greedcon', packageJSON: { name: 'greedcon', version: '1.0.0' } },
    secrets: new SecretStorageMock(),
    globalState: {
      get: () => undefined,
      update: async () => undefined,
      setKeysForSync: () => undefined,
    },
    workspaceState: {
      get: () => undefined,
      update: async () => undefined,
      setKeysForSync: () => undefined,
    },
    extensionMode: ExtensionMode.Test,
    asAbsolutePath: (...segments: string[]) => [storagePath, ...segments].join('/'),
    environmentVariableCollection: { replace: () => undefined, append: () => undefined },
    logPath: `${storagePath}/logs`,
  }),
};
