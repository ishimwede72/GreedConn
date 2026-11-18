/**
 * MessageRouter — validates inbound webview messages, dispatches them to
 * handlers and replies with a uniform envelope. Unsolicited pushes go through
 * `emit`.
 */
import type { AnyWebviewMessage, WebviewEventMap, WebviewEventName } from '../types/Messages';
import { validateWebviewMessage } from './MessageValidator';
import { logger } from '../utils/Logger';

export type MessageHandler = (payload: never) => unknown | Promise<unknown>;

export interface RouterTransport {
  post(message: AnyWebviewMessage): void;
}

export class MessageRouter {
  private readonly handlers = new Map<string, MessageHandler>();

  constructor(private readonly transport: RouterTransport) {}

  register(type: string, handler: MessageHandler): void {
    if (this.handlers.has(type)) {
      logger.warn(`duplicate message handler for "${type}" — replacing`);
    }
    this.handlers.set(type, handler);
  }

  /** Entry point for `webview.onDidReceiveMessage`. */
  async handle(raw: unknown): Promise<void> {
    const validation = validateWebviewMessage(raw);
    if (!validation.ok || !validation.message) {
      logger.warn(`rejected webview message: ${validation.error ?? 'unknown'}`);
      // Reply with an error envelope when we can extract an id.
      const id =
        raw && typeof raw === 'object' && typeof (raw as { id?: unknown }).id === 'string'
          ? (raw as { id: string }).id
          : 'unknown';
      this.transport.post({
        id,
        ok: false,
        error: { code: 'INVALID_MESSAGE', message: validation.error ?? 'Invalid message.' },
      });
      return;
    }

    const { type, payload } = validation.message;
    const handler = this.handlers.get(type);
    if (!handler) {
      this.transport.post({
        id: (raw as { id: string }).id,
        ok: false,
        error: { code: 'NOT_IMPLEMENTED', message: `No handler for "${type}".` },
      });
      return;
    }

    try {
      const data = await handler(payload as never);
      this.transport.post({ id: (raw as { id: string }).id, ok: true, data });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`handler for "${type}" failed: ${message}`);
      this.transport.post({
        id: (raw as { id: string }).id,
        ok: false,
        error: { code: 'HANDLER_ERROR', message },
      });
    }
  }

  /** Push an event to the webview. */
  emit<N extends WebviewEventName>(name: N, data: WebviewEventMap[N]): void {
    this.transport.post({ type: 'event', name, data });
  }
}
