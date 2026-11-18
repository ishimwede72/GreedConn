/**
 * Message-protocol harness: wires `createServices()` to an in-memory
 * transport, drives `services.router.handle(...)` and captures every
 * outbound reply/event envelope for assertions.
 */
import { createServices, getTransportAttacher } from '../../src/services/GreedconServices';
import type { GreedconServices } from '../../src/services/GreedconServices';
import type {
  AnyWebviewMessage,
  WebviewEventMessage,
  WebviewResponseMessage,
} from '../../src/types/Messages';
import { __mock } from '../mocks/vscode.mock';

export function isEventMessage(message: AnyWebviewMessage): message is WebviewEventMessage {
  return 'type' in message && message.type === 'event';
}

export function isResponseMessage(message: AnyWebviewMessage): message is WebviewResponseMessage {
  return 'ok' in message;
}

export interface MessageHarness {
  readonly services: GreedconServices;
  /** Every message captured since the last `send()` call. */
  readonly messages: readonly AnyWebviewMessage[];
  /** Unsolicited `{ type: 'event', name, data }` pushes since last `send()`. */
  readonly events: WebviewEventMessage[];
  /**
   * Send `{ id, type, data }` through the router and return the matching
   * reply envelope (`{ id, ok, data }` or `{ id, ok: false, error }`).
   */
  send(type: string, data?: unknown): Promise<WebviewResponseMessage>;
  /** Detach the capture transport. */
  detach(): void;
}

/**
 * Create a fully wired services container backed by `storagePath`
 * (typically a temp directory) plus a capture transport.
 */
export function createMessageHarness(storagePath: string): MessageHarness {
  const services = createServices({ context: __mock.createExtensionContext(storagePath) });
  let captured: AnyWebviewMessage[] = [];
  const detachTransport = getTransportAttacher(services)((message) => {
    captured.push(message);
  });
  let counter = 0;

  return {
    services,
    get messages(): readonly AnyWebviewMessage[] {
      return captured;
    },
    get events(): WebviewEventMessage[] {
      return captured.filter(isEventMessage);
    },
    async send(type: string, data?: unknown): Promise<WebviewResponseMessage> {
      captured = [];
      counter += 1;
      const id = `msg_${counter}`;
      await services.router.handle(data === undefined ? { id, type } : { id, type, data });
      const reply = captured.find(
        (message): message is WebviewResponseMessage =>
          isResponseMessage(message) && message.id === id,
      );
      if (!reply) {
        throw new Error(`No reply envelope was captured for message type "${type}".`);
      }
      return reply;
    },
    detach(): void {
      detachTransport();
    },
  };
}
