/**
 * VsCodeBridge — the single communication point between the webview UI and
 * the extension host.
 *
 *  - typed request/response correlation with timeouts
 *  - typed push-event subscription
 *  - graceful degradation when running outside VS Code (preview mode)
 */

export interface ResponseMessage<T = unknown> {
  id: string;
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

export interface EventMessage {
  type: 'event';
  name: string;
  data: unknown;
}

export interface VsCodeApi {
  postMessage(message: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
}

declare global {
  interface Window {
    acquireVsCodeApi?: () => VsCodeApi;
  }
}

type EventHandler = (data: never) => void;

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const DEFAULT_TIMEOUT_MS = 30000;

export class VsCodeBridge {
  private readonly api: VsCodeApi | null;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly handlers = new Map<string, Set<EventHandler>>();
  private readonly eventHandlers = new Map<string, Set<(data: unknown) => void>>();
  private sequence = 0;
  private readonly ready: Promise<void>;

  constructor() {
    this.api = typeof window.acquireVsCodeApi === 'function' ? window.acquireVsCodeApi() : null;
    this.ready = new Promise((resolve) => {
      window.addEventListener('message', (event: MessageEvent<unknown>) => {
        const message = event.data as ResponseMessage | EventMessage | undefined;
        if (!message || typeof message !== 'object') return;

        if ('type' in message && message.type === 'event') {
          this.dispatchEvent(message.name, message.data);
          return;
        }
        const response = message as ResponseMessage;
        if (typeof response.id !== 'string') return;
        const entry = this.pending.get(response.id);
        if (!entry) return;
        this.pending.delete(response.id);
        clearTimeout(entry.timer);
        if (response.ok) {
          entry.resolve(response.data);
        } else {
          entry.reject(new Error(response.error?.message ?? 'Request failed.'));
        }
      });
      resolve();
    });
  }

  get isVsCode(): boolean {
    return this.api !== null;
  }

  /** Send a typed request and await its response. */
  request<T>(type: string, data: Record<string, unknown> = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
    if (!this.api) {
      return Promise.reject(new Error(`Bridge unavailable (offline preview): ${type}`));
    }
    this.sequence += 1;
    const id = `m${Date.now().toString(36)}_${this.sequence}`;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Timed out waiting for "${type}".`));
      }, timeoutMs);
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      });
      this.api?.postMessage({ id, type, data });
    });
  }

  /** Subscribe to a host-pushed event; returns an unsubscribe function. */
  on<N extends string>(name: N, handler: (data: unknown) => void): () => void {
    let set = this.eventHandlers.get(name);
    if (!set) {
      set = new Set();
      this.eventHandlers.set(name, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  /** Notify local (webview-only) listeners — used by the offline preview. */
  emitLocal(name: string, data: unknown): void {
    this.dispatchEvent(name, data);
  }

  private dispatchEvent(name: string, data: unknown): void {
    const set = this.eventHandlers.get(name);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(data);
      } catch (error) {
        console.error(`[greedcon] event handler for "${name}" failed`, error);
      }
    }
    const wildcard = this.eventHandlers.get('*');
    if (wildcard) {
      for (const handler of wildcard) handler({ name, data });
    }
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  getState<T>(): T | undefined {
    return this.api?.getState() as T | undefined;
  }

  setState(state: unknown): void {
    this.api?.setState(state);
  }
}

export const bridge = new VsCodeBridge();
