import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

/**
 * Vitest configuration.
 *
 * - `vscode` is aliased to a deterministic in-memory mock so the whole
 *   extension (handlers, storage, security) can run outside VS Code.
 * - Tests never touch the real network: integration tests spawn local
 *   `node:http` servers on 127.0.0.1 with ephemeral ports.
 */
export default defineConfig({
  resolve: {
    alias: {
      vscode: fileURLToPath(new URL('./tests/mocks/vscode.mock.ts', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'media/**', 'webview/**'],
    testTimeout: 20_000,
    hookTimeout: 20_000,
    reporters: process.env.CI ? ['default', 'junit'] : ['default'],
    outputFile: { junit: 'dist/test-results/junit.xml' },
    coverage: {
      provider: 'v8',
      reportsDirectory: 'dist/coverage',
      include: ['src/**/*.ts', 'webview/**/*.ts'],
      exclude: ['src/types/**', 'src/extension.ts'],
    },
  },
});
