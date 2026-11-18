/**
 * Extension-wide constants.
 */

export const EXTENSION_ID = 'GreedConn.greedcon';
export const EXTENSION_NAME = 'Greedcon';
export const OUTPUT_CHANNEL_NAME = 'Greedcon';

export const COMMANDS = {
  open: 'greedcon.open',
  newRequest: 'greedcon.newRequest',
  saveRequest: 'greedcon.saveRequest',
  importCollection: 'greedcon.importCollection',
  exportCollection: 'greedcon.exportCollection',
  openHistory: 'greedcon.openHistory',
  runTests: 'greedcon.runTests',
  openSettings: 'greedcon.openSettings',
  openPanel: 'greedcon.openPanel',
  clearHistory: 'greedcon.clearHistory',
} as const;

export const VIEW_IDS = {
  main: 'greedcon.views.main',
  collections: 'greedcon.views.collections',
  environments: 'greedcon.views.environments',
  history: 'greedcon.views.history',
} as const;
