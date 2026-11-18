/**
 * MessageTypes — string constants + type guards for the message protocol.
 * (Runtime-safe subset of MessageTypes used by validation.)
 */
import { PAGE_IDS, type PageId } from '../types/Messages';

export const MESSAGE_TYPES = [
  'app.init',
  'app.navigate',
  'app.getState',
  'app.openSettings',
  'app.openExternal',
  'app.saveDraft',
  'request.send',
  'request.cancel',
  'request.formatJson',
  'request.validateJson',
  'collections.list',
  'collections.get',
  'collections.create',
  'collections.rename',
  'collections.delete',
  'collections.duplicate',
  'collections.folder.create',
  'collections.folder.rename',
  'collections.folder.delete',
  'collections.request.save',
  'collections.item.delete',
  'collections.item.rename',
  'collections.item.duplicate',
  'collections.item.move',
  'collections.import',
  'collections.export',
  'collections.search',
  'collections.pickFile',
  'collections.saveFile',
  'environments.list',
  'environments.create',
  'environments.rename',
  'environments.delete',
  'environments.setActive',
  'environments.variable.upsert',
  'environments.variable.delete',
  'environments.import',
  'environments.export',
  'history.search',
  'history.delete',
  'history.clear',
  'history.cleanup',
  'history.rerun',
  'tests.save',
  'tests.run',
  'tests.runCollection',
  'tests.history',
  'auth.storeCredential',
  'auth.deleteCredential',
  'auth.oauth2Authorize',
  'auth.oauth2Clear',
  'settings.get',
  'settings.update',
  'demo.seed',
] as const;

export type MessageType = (typeof MESSAGE_TYPES)[number];

export function isMessageType(value: unknown): value is MessageType {
  return typeof value === 'string' && (MESSAGE_TYPES as readonly string[]).includes(value);
}

export function isPageId(value: unknown): value is PageId {
  return typeof value === 'string' && (PAGE_IDS as readonly string[]).includes(value);
}
