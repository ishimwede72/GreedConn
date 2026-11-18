/**
 * Page contract shared by all pages.
 */
import type { PageId } from '../../src/types/Messages';

export interface Page {
  readonly id: PageId;
  /** (Re)render into the given container. Called on every state change. */
  render(container: HTMLElement): void;
  /** Release subscriptions when the page is replaced. */
  dispose?(): void;
}
