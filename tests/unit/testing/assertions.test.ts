/**
 * Unit tests for declarative assertion evaluation — `evaluateAssertion`
 * dispatching to the per-type evaluators (status, responseTime, body,
 * header, jsonPath) with a crafted response fixture.
 */
import { describe, it, expect } from 'vitest';
import { evaluateAssertion } from '../../../src/testing/TestAssertion';
import type { AssertionDefinition } from '../../../src/types/Testing';
import type { HttpResponseModel } from '../../../src/types/Response';

const JSON_BODY = JSON.stringify({
  a: { b: [{ c: 'hello' }, { c: 'world' }] },
  tags: ['admin', 'editor'],
  count: 10,
  flag: true,
});

function makeResponse(overrides: Partial<HttpResponseModel> = {}): HttpResponseModel {
  return {
    status: 200,
    statusText: 'OK',
    headers: { 'content-type': 'application/json', 'x-request-id': 'req-42' },
    cookies: [],
    body: JSON_BODY,
    bodyKind: 'json',
    responseTime: 150,
    responseSize: JSON_BODY.length,
    contentType: 'application/json',
    requestId: 'req-1',
    ...overrides,
  };
}

describe('evaluateAssertion — status', () => {
  it('passes equals and reports actual/expected', () => {
    const result = evaluateAssertion({ type: 'status', operator: 'equals', value: 200 }, { response: makeResponse() });
    expect(result.type).toBe('status');
    expect(result.status).toBe('passed');
    expect(result.actual).toBe('200');
    expect(result.expected).toBe('200');
    expect(result.description).toBe('Status code == 200');
  });

  it('fails equals with a descriptive message', () => {
    const result = evaluateAssertion({ type: 'status', operator: 'equals', value: 201 }, { response: makeResponse() });
    expect(result.status).toBe('failed');
    expect(result.message).toBe('Expected status == 201 but received 200.');
    expect(result.actual).toBe('200');
    expect(result.expected).toBe('201');
  });

  it('supports notEquals, lt and gt', () => {
    const response = makeResponse({ status: 204 });
    expect(evaluateAssertion({ type: 'status', operator: 'notEquals', value: 200 }, { response }).status).toBe('passed');
    expect(evaluateAssertion({ type: 'status', operator: 'lt', value: 300 }, { response }).status).toBe('passed');
    expect(evaluateAssertion({ type: 'status', operator: 'gt', value: 100 }, { response }).status).toBe('passed');
    expect(evaluateAssertion({ type: 'status', operator: 'gt', value: 300 }, { response }).status).toBe('failed');
    expect(evaluateAssertion({ type: 'status', operator: 'lt', value: 100 }, { response }).status).toBe('failed');
  });

  it('fails every operator when no status was received (status 0)', () => {
    const response = makeResponse({ status: 0, statusText: '' });
    const result = evaluateAssertion({ type: 'status', operator: 'equals', value: 200 }, { response });
    expect(result.status).toBe('failed');
    expect(result.message).toBe('No HTTP status was received (transport error).');
    expect(result.actual).toBe('0');
    expect(evaluateAssertion({ type: 'status', operator: 'gt', value: 0 }, { response }).status).toBe('failed');
  });
});

describe('evaluateAssertion — responseTime', () => {
  it('passes a below-threshold check and reports ms values', () => {
    const result = evaluateAssertion({ type: 'responseTime', operator: 'lt', value: 1000 }, { response: makeResponse() });
    expect(result.type).toBe('responseTime');
    expect(result.status).toBe('passed');
    expect(result.actual).toBe('150 ms');
    expect(result.expected).toBe('1000 ms');
  });

  it('fails when the threshold is violated', () => {
    const result = evaluateAssertion({ type: 'responseTime', operator: 'lt', value: 100 }, { response: makeResponse() });
    expect(result.status).toBe('failed');
    expect(result.message).toBe('Expected < 100 ms but measured 150 ms.');
    expect(result.actual).toBe('150 ms');
    expect(result.expected).toBe('100 ms');
  });

  it('supports gte comparisons', () => {
    expect(
      evaluateAssertion({ type: 'responseTime', operator: 'gte', value: 150 }, { response: makeResponse() }).status,
    ).toBe('passed');
    expect(
      evaluateAssertion({ type: 'responseTime', operator: 'gte', value: 151 }, { response: makeResponse() }).status,
    ).toBe('failed');
  });

  it('fails when the response time is unavailable (NaN)', () => {
    const result = evaluateAssertion({ type: 'responseTime', operator: 'lt', value: 500 }, { response: makeResponse({ responseTime: Number.NaN }) });
    expect(result.status).toBe('failed');
    expect(result.message).toBe('Response time is unavailable.');
    expect(result.actual).toBe('n/a');
  });
});

describe('evaluateAssertion — body', () => {
  const body = '{"message":"Hello World"}';
  const evaluate = (assertion: AssertionDefinition): ReturnType<typeof evaluateAssertion> =>
    evaluateAssertion(assertion, { response: makeResponse({ body, bodyKind: 'json' }) });

  it('contains passes and fails with actual/expected', () => {
    const pass = evaluate({ type: 'body', operator: 'contains', value: 'Hello' });
    expect(pass.type).toBe('body');
    expect(pass.status).toBe('passed');
    // Passing body assertions only carry description/status; actual/expected
    // are reported on failures.
    expect(pass.actual).toBeUndefined();
    expect(pass.message).toBeUndefined();

    const fail = evaluate({ type: 'body', operator: 'contains', value: 'Goodbye' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Response body does not contain "Goodbye".');
    expect(fail.expected).toBe('Goodbye');
  });

  it('notContains inverts the check', () => {
    expect(evaluate({ type: 'body', operator: 'notContains', value: 'Goodbye' }).status).toBe('passed');
    const fail = evaluate({ type: 'body', operator: 'notContains', value: 'Hello' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Response body unexpectedly contains "Hello".');
  });

  it('equals requires an exact match', () => {
    expect(evaluate({ type: 'body', operator: 'equals', value: body }).status).toBe('passed');
    const fail = evaluate({ type: 'body', operator: 'equals', value: '{"message":"Hi"}' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Response body does not exactly match the expected value.');
  });

  it('matches evaluates a regular expression', () => {
    expect(evaluate({ type: 'body', operator: 'matches', value: '^\\{"message"' }).status).toBe('passed');
    const fail = evaluate({ type: 'body', operator: 'matches', value: 'Goodbye' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toContain('Response body does not match /Goodbye/.');
  });

  it('matches reports invalid regular expressions as errors', () => {
    const invalid = evaluate({ type: 'body', operator: 'matches', value: '[' });
    expect(invalid.status).toBe('error');
    expect(invalid.message).toBe('Invalid or too complex regular expression.');

    const tooLong = evaluate({ type: 'body', operator: 'matches', value: 'a'.repeat(1001) });
    expect(tooLong.status).toBe('error');
  });

  it('exists / notExists depend on body emptiness', () => {
    expect(evaluate({ type: 'body', operator: 'exists', value: '' }).status).toBe('passed');
    expect(evaluate({ type: 'body', operator: 'notExists', value: '' }).status).toBe('failed');

    const empty = evaluateAssertion({ type: 'body', operator: 'exists', value: '' }, { response: makeResponse({ body: '' }) });
    expect(empty.status).toBe('failed');
    expect(empty.message).toBe('Response body is empty.');
    expect(evaluateAssertion({ type: 'body', operator: 'notExists', value: '' }, { response: makeResponse({ body: '' }) }).status).toBe('passed');
  });

  it('caseInsensitive lowercases both sides for contains', () => {
    expect(evaluate({ type: 'body', operator: 'contains', value: 'hello world', caseInsensitive: true }).status).toBe('passed');
    expect(evaluate({ type: 'body', operator: 'contains', value: 'hello world' }).status).toBe('failed');
  });

  it('reports an unsupported operator as an error', () => {
    const bogus = { type: 'body', operator: 'startsWith', value: 'x' } as unknown as AssertionDefinition;
    const result = evaluateAssertion(bogus, { response: makeResponse({ body }) });
    expect(result.type).toBe('body');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Unsupported operator.');
  });
});

describe('evaluateAssertion — header', () => {
  const evaluate = (assertion: AssertionDefinition, headers?: Record<string, string>): ReturnType<typeof evaluateAssertion> =>
    evaluateAssertion(assertion, { response: makeResponse({ headers: headers ?? makeResponse().headers }) });

  it('exists finds a present header', () => {
    const result = evaluate({ type: 'header', header: 'content-type', operator: 'exists' });
    expect(result.type).toBe('header');
    expect(result.status).toBe('passed');
    expect(result.actual).toBe('application/json');
  });

  it('exists fails for a missing header', () => {
    const result = evaluate({ type: 'header', header: 'x-missing', operator: 'exists' });
    expect(result.status).toBe('failed');
    expect(result.message).toBe('Header "x-missing" is missing.');
    expect(result.expected).toBe('present');
  });

  it('notExists requires absence', () => {
    expect(evaluate({ type: 'header', header: 'x-missing', operator: 'notExists' }).status).toBe('passed');
    const fail = evaluate({ type: 'header', header: 'content-type', operator: 'notExists' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Header "content-type" is present but should be absent.');
  });

  it('equals compares the full value and reports missing headers', () => {
    const pass = evaluate({ type: 'header', header: 'content-type', operator: 'equals', value: 'application/json' });
    expect(pass.status).toBe('passed');
    expect(pass.actual).toBe('application/json');
    expect(pass.expected).toBe('application/json');

    const fail = evaluate({ type: 'header', header: 'content-type', operator: 'equals', value: 'text/plain' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Header "content-type" value does not match.');

    const missing = evaluate({ type: 'header', header: 'x-missing', operator: 'equals', value: 'x' });
    expect(missing.actual).toBe('(missing)');
  });

  it('contains checks a substring of the header value', () => {
    expect(evaluate({ type: 'header', header: 'x-request-id', operator: 'contains', value: 'req-' }).status).toBe('passed');
    expect(evaluate({ type: 'header', header: 'x-request-id', operator: 'contains', value: 'other' }).status).toBe('failed');
  });

  it('matches applies a case-insensitive pattern', () => {
    expect(evaluate({ type: 'header', header: 'content-type', operator: 'matches', value: 'JSON$' }).status).toBe('passed');
    const fail = evaluate({ type: 'header', header: 'content-type', operator: 'matches', value: 'xml' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Header "content-type" does not match the pattern.');
  });

  it('matches reports invalid patterns as errors', () => {
    const result = evaluate({ type: 'header', header: 'content-type', operator: 'matches', value: '[' });
    expect(result.status).toBe('error');
    expect(result.message).toBe('Invalid regular expression.');
  });

  it('looks up headers case-insensitively', () => {
    const result = evaluate({ type: 'header', header: 'CONTENT-TYPE', operator: 'exists' });
    expect(result.status).toBe('passed');
    expect(result.actual).toBe('application/json');
  });

  it('rejects an empty header name with an error', () => {
    const result = evaluate({ type: 'header', header: '   ', operator: 'exists' });
    expect(result.type).toBe('header');
    expect(result.status).toBe('error');
    expect(result.message).toBe('Header name is required.');
    expect(result.description).toBe('Header assertion');
  });

  it('reports an unsupported operator as an error', () => {
    const bogus = { type: 'header', header: 'x', operator: 'notEquals', value: '1' } as unknown as AssertionDefinition;
    const result = evaluateAssertion(bogus, { response: makeResponse() });
    expect(result.status).toBe('error');
    expect(result.message).toBe('Unsupported operator.');
  });
});

describe('evaluateAssertion — jsonPath', () => {
  const evaluate = (assertion: AssertionDefinition, body = JSON_BODY): ReturnType<typeof evaluateAssertion> =>
    evaluateAssertion(assertion, { response: makeResponse({ body }) });

  it('equals extracts $.a.b[0].c and compares', () => {
    const pass = evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'equals', value: 'hello' });
    expect(pass.type).toBe('jsonPath');
    expect(pass.status).toBe('passed');
    expect(pass.actual).toBe('hello');
    expect(pass.expected).toBe('hello');
    expect(pass.description).toContain('$.a.b[0].c');

    const fail = evaluate({ type: 'jsonPath', path: '$.a.b[1].c', operator: 'equals', value: 'nope' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Value at "$.a.b[1].c" does not equal the expected value.');
  });

  it('equals compares numbers loosely', () => {
    expect(evaluate({ type: 'jsonPath', path: '$.count', operator: 'equals', value: 10 }).status).toBe('passed');
    expect(evaluate({ type: 'jsonPath', path: '$.flag', operator: 'equals', value: true }).status).toBe('passed');
  });

  it('notEquals excludes the given value', () => {
    expect(evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'notEquals', value: 'other' }).status).toBe('passed');
    const fail = evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'notEquals', value: 'hello' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Value at "$.a.b[0].c" equals the excluded value.');
  });

  it('contains works for strings and arrays', () => {
    expect(evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'contains', value: 'ell' }).status).toBe('passed');
    // Array contains compares array members for (loose) equality.
    expect(evaluate({ type: 'jsonPath', path: '$.tags', operator: 'contains', value: 'admin' }).status).toBe('passed');
    expect(evaluate({ type: 'jsonPath', path: '$.tags', operator: 'contains', value: 'viewer' }).status).toBe('failed');
    const fail = evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'contains', value: 'zzz' });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Value at "$.a.b[0].c" does not contain the expected content.');
  });

  it('matches applies a case-insensitive pattern', () => {
    expect(evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'matches', value: 'H.LLO' }).status).toBe('passed');
    const fail = evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'matches', value: 'z$' });
    expect(fail.status).toBe('failed');
  });

  it('matches reports invalid patterns as errors', () => {
    const result = evaluate({ type: 'jsonPath', path: '$.count', operator: 'matches', value: '[' });
    expect(result.status).toBe('error');
    expect(result.message).toBe('Invalid regular expression.');
  });

  it('exists / notExists report found and missing paths', () => {
    expect(evaluate({ type: 'jsonPath', path: '$.count', operator: 'exists' }).status).toBe('passed');
    const missing = evaluate({ type: 'jsonPath', path: '$.missing', operator: 'exists' });
    expect(missing.status).toBe('failed');
    expect(missing.message).toBe('Path "$.missing" was not found.');
    expect(missing.actual).toBe('(not found)');

    expect(evaluate({ type: 'jsonPath', path: '$.missing', operator: 'notExists' }).status).toBe('passed');
    const present = evaluate({ type: 'jsonPath', path: '$.count', operator: 'notExists' });
    expect(present.status).toBe('failed');
    expect(present.message).toBe('Path "$.count" exists but should not.');
  });

  it('supports lt / lte / gt / gte numeric comparisons', () => {
    expect(evaluate({ type: 'jsonPath', path: '$.count', operator: 'lt', value: 20 }).status).toBe('passed');
    expect(evaluate({ type: 'jsonPath', path: '$.count', operator: 'lte', value: 10 }).status).toBe('passed');
    expect(evaluate({ type: 'jsonPath', path: '$.count', operator: 'gt', value: 5 }).status).toBe('passed');
    expect(evaluate({ type: 'jsonPath', path: '$.count', operator: 'gte', value: 10 }).status).toBe('passed');

    const fail = evaluate({ type: 'jsonPath', path: '$.count', operator: 'gte', value: 11 });
    expect(fail.status).toBe('failed');
    expect(fail.message).toBe('Numeric comparison failed at "$.count".');
    expect(fail.actual).toBe('10');
    expect(fail.expected).toBe('11');
  });

  it('numeric comparisons of non-numeric values are errors', () => {
    const notNumber = evaluate({ type: 'jsonPath', path: '$.a.b[0].c', operator: 'lt', value: 5 });
    expect(notNumber.status).toBe('error');
    expect(notNumber.message).toBe('Numeric comparison requires numeric values.');

    const notFound = evaluate({ type: 'jsonPath', path: '$.missing', operator: 'lt', value: 5 });
    expect(notFound.status).toBe('error');
    expect(notFound.message).toBe('Numeric comparison requires numeric values.');
  });

  it('non-JSON bodies are errors', () => {
    const result = evaluate({ type: 'jsonPath', path: '$.a', operator: 'exists' }, '<html>not json</html>');
    expect(result.type).toBe('jsonPath');
    expect(result.status).toBe('error');
    expect(result.message).toContain('Response body is not valid JSON:');
  });

  it('reports an unsupported operator as an error', () => {
    const bogus = { type: 'jsonPath', path: '$.count', operator: 'startsWith', value: '1' } as unknown as AssertionDefinition;
    const result = evaluateAssertion(bogus, { response: makeResponse() });
    expect(result.status).toBe('error');
    expect(result.message).toBe('Unsupported operator.');
  });
});

describe('evaluateAssertion — unknown type', () => {
  it('returns an error result for an unrecognized assertion type', () => {
    const unknown = { type: 'bogus', operator: 'equals', value: 1 } as unknown as AssertionDefinition;
    const result = evaluateAssertion(unknown, { response: makeResponse() });
    expect(result.type).toBe('status');
    expect(result.description).toBe('Unknown assertion');
    expect(result.status).toBe('error');
    expect(result.message).toContain('Unsupported assertion type');
    expect(result.message).toContain('"bogus"');
  });
});
