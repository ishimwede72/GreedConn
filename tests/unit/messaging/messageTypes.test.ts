/**
 * Unit tests for the message protocol type guards.
 */
import { describe, it, expect } from 'vitest';
import { MESSAGE_TYPES, isMessageType, isPageId } from '../../../src/messaging/MessageTypes';
import { PAGE_IDS } from '../../../src/types/Messages';

describe('MESSAGE_TYPES', () => {
  it('declares a non-trivial protocol surface', () => {
    expect(MESSAGE_TYPES.length).toBeGreaterThan(40);
    expect(new Set(MESSAGE_TYPES).size).toBe(MESSAGE_TYPES.length);
  });

  it('isMessageType accepts every declared type', () => {
    for (const type of MESSAGE_TYPES) {
      expect(isMessageType(type)).toBe(true);
    }
  });

  it('isMessageType rejects junk', () => {
    for (const junk of ['', 'app', 'APP.INIT', 'app.init ', 'app.initX', 'nope.nope', 42, null, undefined, {}, []]) {
      expect(isMessageType(junk)).toBe(false);
    }
  });
});

describe('PAGE_IDS', () => {
  it('declares the navigable pages', () => {
    expect(PAGE_IDS).toEqual(['welcome', 'requests', 'collections', 'environments', 'history', 'tests', 'settings']);
  });

  it('isPageId accepts every declared page id', () => {
    for (const page of PAGE_IDS) {
      expect(isPageId(page)).toBe(true);
    }
  });

  it('isPageId rejects junk', () => {
    for (const junk of ['', 'Welcome', 'dashboard', 'settings.', 0, null, undefined, ['settings']]) {
      expect(isPageId(junk)).toBe(false);
    }
  });
});
