/**
 * Stable identifier generation.
 *
 * Uses `crypto.randomUUID` when available (Node >= 19 / VS Code webview)
 * with a documented fallback.
 */

interface RandomSource {
  randomUUID?: () => string;
  getRandomValues?: (array: Uint8Array) => Uint8Array;
}

let counter = 0;

export function generateId(prefix = 'id'): string {
  const cryptoRef = (globalThis as { crypto?: RandomSource }).crypto;
  if (cryptoRef && typeof cryptoRef.randomUUID === 'function') {
    return `${prefix}_${cryptoRef.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  }
  counter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${time}${rand}${counter.toString(36)}`;
}

export function generateRequestId(): string {
  return generateId('req');
}

export function generateCollectionId(): string {
  return generateId('col');
}

export function generateItemId(): string {
  return generateId('itm');
}

export function generateFolderId(): string {
  return generateId('fld');
}

export function generateEnvironmentId(): string {
  return generateId('env');
}

export function generateVariableId(): string {
  return generateId('var');
}

export function generateTestId(): string {
  return generateId('tst');
}

export function generateHistoryId(): string {
  return generateId('hst');
}

export function generateRunId(): string {
  return generateId('run');
}

export function generateSecretId(): string {
  return generateId('sec');
}
