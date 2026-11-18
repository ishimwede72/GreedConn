/**
 * Unit tests for TestParser — normalization of test definitions arriving
 * from the webview, imports and storage, plus serialization round-trips.
 */
import { describe, it, expect } from 'vitest';
import { parseTests, serializeTests } from '../../../src/testing/TestParser';
import type { TestDefinition } from '../../../src/types/Testing';

describe('parseTests — valid input', () => {
  it('parses tests with assertions and extractions', () => {
    const raw = [
      {
        id: 't1',
        name: 'Status ok',
        enabled: true,
        assertions: [
          { type: 'status', operator: 'equals', value: 200 },
          { type: 'body', operator: 'contains', value: 'ok', caseInsensitive: true },
          { type: 'header', header: 'content-type', operator: 'exists' },
          { type: 'jsonPath', path: '$.user.id', operator: 'gte', value: 1 },
        ],
        extractions: [
          { type: 'extract', name: 'userId', source: 'jsonPath', path: '$.user.id', scope: 'environment' },
          { type: 'extract', name: 'requestId', source: 'header', header: 'x-request-id', scope: 'environment' },
          { type: 'extract', name: 'code', source: 'status', scope: 'environment' },
        ],
      },
      {
        id: 't2',
        name: 'Timing',
        enabled: false,
        assertions: [{ type: 'responseTime', operator: 'lt', value: 500 }],
      },
    ];

    const result = parseTests(raw);

    expect(result.warnings).toEqual([]);
    expect(result.tests).toHaveLength(2);
    expect(result.tests[0]).toEqual(raw[0]);
    expect(result.tests[1]).toEqual(raw[1]);
  });

  it('keeps jsonPath value types (number/boolean/null)', () => {
    const result = parseTests([
      {
        id: 't1',
        name: 'Values',
        enabled: true,
        assertions: [
          { type: 'jsonPath', path: '$.a', operator: 'equals', value: 5 },
          { type: 'jsonPath', path: '$.b', operator: 'equals', value: true },
          { type: 'jsonPath', path: '$.c', operator: 'equals', value: null },
        ],
      },
    ]);

    expect(result.warnings).toEqual([]);
    expect(result.tests[0].assertions).toEqual([
      { type: 'jsonPath', path: '$.a', operator: 'equals', value: 5 },
      { type: 'jsonPath', path: '$.b', operator: 'equals', value: true },
      { type: 'jsonPath', path: '$.c', operator: 'equals', value: null },
    ]);
  });
});

describe('parseTests — non-array input', () => {
  it('returns an empty list with a warning for non-array payloads', () => {
    expect(parseTests('nope')).toEqual({ tests: [], warnings: ['Tests payload must be an array.'] });
    expect(parseTests({ tests: [] })).toEqual({ tests: [], warnings: ['Tests payload must be an array.'] });
    expect(parseTests(42)).toEqual({ tests: [], warnings: ['Tests payload must be an array.'] });
  });

  it('silently accepts null/undefined (no tests defined)', () => {
    expect(parseTests(null)).toEqual({ tests: [], warnings: [] });
    expect(parseTests(undefined)).toEqual({ tests: [], warnings: [] });
  });
});

describe('parseTests — invalid entries', () => {
  it('skips invalid assertion entries with warnings and keeps valid ones', () => {
    const result = parseTests([
      {
        id: 't1',
        name: 'Mixed',
        enabled: true,
        assertions: [
          { type: 'status', operator: 'equals', value: 200 },
          { type: 'status', operator: 'contains', value: 200 },
          'not-an-object',
          { type: 'bogus', operator: 'equals', value: 1 },
          { type: 'responseTime', operator: 'lt', value: 100 },
        ],
      },
    ]);

    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].assertions).toEqual([
      { type: 'status', operator: 'equals', value: 200 },
      { type: 'responseTime', operator: 'lt', value: 100 },
    ]);
    expect(result.warnings).toHaveLength(3);
    expect(result.warnings[0]).toBe('Test "Mixed": assertion 1 is invalid; skipped.');
    expect(result.warnings[1]).toBe('Test "Mixed": assertion 2 is invalid; skipped.');
    expect(result.warnings[2]).toBe('Test "Mixed": assertion 3 is invalid; skipped.');
  });

  it('drops tests that end up with zero valid assertions', () => {
    const result = parseTests([
      { id: 't1', name: 'Broken', enabled: true, assertions: [{ type: 'status', operator: 'contains', value: 1 }] },
      { id: 't2', name: 'Fine', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
    ]);

    expect(result.tests.map((t) => t.id)).toEqual(['t2']);
    expect(result.warnings).toEqual([
      'Test "Broken": assertion 0 is invalid; skipped.',
      'Test "Broken" has no valid assertions; skipped.',
    ]);
  });

  it('keeps a test that only has valid extractions', () => {
    const result = parseTests([
      {
        id: 't1',
        name: 'Extract only',
        enabled: true,
        assertions: [{ type: 'status', operator: 'bogus', value: 1 }],
        extractions: [{ name: 'code', source: 'status' }],
      },
    ]);

    expect(result.tests).toHaveLength(1);
    expect(result.tests[0].assertions).toEqual([]);
    expect(result.tests[0].extractions).toEqual([
      { type: 'extract', name: 'code', source: 'status', scope: 'environment' },
    ]);
    // The invalid assertion is warned about, but the valid extraction keeps
    // the test alive (so no "no valid assertions" warning).
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toBe('Test "Extract only": assertion 0 is invalid; skipped.');
  });

  it('skips non-object test entries with a warning', () => {
    const result = parseTests(['oops', null, { id: 't1', name: 'Ok', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 200 }] }]);
    expect(result.tests).toHaveLength(1);
    expect(result.warnings).toEqual([
      'Test at index 0 is not an object; skipped.',
      'Test at index 1 is not an object; skipped.',
    ]);
  });

  it('skips invalid extractions but keeps valid ones', () => {
    const result = parseTests([
      {
        id: 't1',
        name: 'Extractions',
        enabled: true,
        assertions: [{ type: 'status', operator: 'equals', value: 200 }],
        extractions: [
          { name: 'bad', source: 'cookie' },
          { name: 'missingPath', source: 'jsonPath' },
          { name: 'code', source: 'status' },
        ],
      },
    ]);

    expect(result.tests[0].extractions).toEqual([
      { type: 'extract', name: 'code', source: 'status', scope: 'environment' },
    ]);
    expect(result.warnings).toHaveLength(2);
    expect(result.warnings.every((w) => w.includes('invalid extraction'))).toBe(true);
  });
});

describe('parseTests — defaults', () => {
  it('generates an id when missing', () => {
    const result = parseTests([
      { name: 'No id', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
    ]);
    expect(result.tests[0].id).toMatch(/^tst_/);
    expect(result.tests[0].id.length).toBeGreaterThan(4);
  });

  it('generates distinct ids for entries without ids', () => {
    const result = parseTests([
      { name: 'A', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
      { name: 'B', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 201 }] },
    ]);
    expect(result.tests[0].id).not.toBe(result.tests[1].id);
  });

  it('defaults enabled to true and name to Test N', () => {
    const result = parseTests([
      { assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
      { assertions: [{ type: 'status', operator: 'equals', value: 201 }] },
    ]);
    expect(result.tests[0]).toMatchObject({ name: 'Test 1', enabled: true });
    expect(result.tests[1]).toMatchObject({ name: 'Test 2', enabled: true });
    expect(result.tests[0].id).toMatch(/^tst_/);
  });

  it('keeps an explicit enabled: false', () => {
    const result = parseTests([
      { id: 't1', name: 'Off', enabled: false, assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
    ]);
    expect(result.tests[0].enabled).toBe(false);
  });

  it('ignores a non-boolean enabled value', () => {
    const result = parseTests([
      { id: 't1', name: 'Odd', enabled: 'yes', assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
    ]);
    expect(result.tests[0].enabled).toBe(true);
  });

  it('omits the extractions key when there are none', () => {
    const result = parseTests([
      { id: 't1', name: 'Plain', enabled: true, assertions: [{ type: 'status', operator: 'equals', value: 200 }] },
    ]);
    expect('extractions' in result.tests[0]).toBe(false);
  });
});

describe('serializeTests round-trip', () => {
  const source: TestDefinition[] = [
    {
      id: 't1',
      name: 'Full test',
      enabled: true,
      assertions: [
        { type: 'status', operator: 'equals', value: 200 },
        { type: 'body', operator: 'contains', value: 'ok', caseInsensitive: true },
        { type: 'header', header: 'x-request-id', operator: 'matches', value: 'req-' },
        { type: 'jsonPath', path: '$.user.id', operator: 'gte', value: 7 },
      ],
      extractions: [
        { type: 'extract', name: 'userId', source: 'jsonPath', path: '$.user.id', scope: 'environment' },
        { type: 'extract', name: 'code', source: 'status', scope: 'environment' },
      ],
    },
    { id: 't2', name: 'Disabled test', enabled: false, assertions: [{ type: 'responseTime', operator: 'lt', value: 250 }] },
  ];

  it('parse(serialize(x)) deep-equals x', () => {
    const serialized = serializeTests(source);
    const result = parseTests(JSON.parse(serialized) as unknown);
    expect(result.warnings).toEqual([]);
    expect(result.tests).toEqual(source);
  });

  it('parse(serialize(x)) matches modulo generated ids', () => {
    const withoutIds = source.map(({ id: _id, ...rest }) => rest) as unknown as TestDefinition[];
    const result = parseTests(JSON.parse(serializeTests(withoutIds)) as unknown);
    expect(result.warnings).toEqual([]);
    expect(result.tests.map((t) => ({ ...t, id: '' }))).toEqual(
      withoutIds.map((t) => ({ ...t, id: '' })),
    );
    for (const test of result.tests) {
      expect(test.id).toMatch(/^tst_/);
    }
  });

  it('serializeTests produces pretty-printed JSON', () => {
    const serialized = serializeTests(source);
    expect(serialized).toContain('\n  {');
    expect(JSON.parse(serialized)).toEqual(source);
  });
});
