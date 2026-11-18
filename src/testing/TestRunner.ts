/**
 * TestRunner — executes declarative test definitions against a response.
 *
 * Security model: there is no user-supplied script execution. Assertions are
 * data structures evaluated by the extension host with bounded regexes and
 * JSON-path lookups (see docs/SECURITY.md).
 */
import type { HttpResponseModel } from '../types/Response';
import type { HttpRequestModel } from '../types/Request';
import type {
  ExtractDefinition,
  TestDefinition,
  TestResult,
  TestRunResult,
} from '../types/Testing';
import { evaluateAssertion } from './TestAssertion';
import { extractJsonPath } from './assertions/JsonPathAssertion';
import { getHeader } from './assertions/HeaderAssertion';
import { buildRunResult, testStatus } from './TestResult';
import { logger } from '../utils/Logger';

export interface TestRunnerHooks {
  /** Called for each extraction outcome (used to persist environment values). */
  onExtract?: (name: string, value: string) => void | Promise<void>;
}

export class TestRunner {
  async run(
    tests: TestDefinition[],
    response: HttpResponseModel,
    request: HttpRequestModel,
    hooks: TestRunnerHooks = {},
  ): Promise<TestRunResult> {
    const startedAt = performance.now();
    const results: TestResult[] = [];

    for (const test of tests) {
      if (!test.enabled) {
        results.push({
          testId: test.id,
          name: test.name,
          status: 'skipped',
          assertions: [],
          extractions: [],
          durationMs: 0,
        });
        continue;
      }

      const testStart = performance.now();
      const assertionResults = [];
      for (const assertion of test.assertions) {
        assertionResults.push(evaluateAssertion(assertion, { response }));
      }

      const extractionResults = [];
      for (const extraction of test.extractions ?? []) {
        extractionResults.push(await this.runExtraction(extraction, response, hooks));
      }

      results.push({
        testId: test.id,
        name: test.name,
        status: testStatus(assertionResults, extractionResults),
        assertions: assertionResults,
        extractions: extractionResults,
        durationMs: Math.round(performance.now() - testStart),
      });
    }

    const run = buildRunResult({
      requestId: request.id,
      requestName: request.name,
      responseTime: Math.round(performance.now() - startedAt),
      results,
    });
    logger.debug(`test run ${run.runId}: ${run.summary.passed}/${run.summary.total} passed`);
    return run;
  }

  private async runExtraction(
    extraction: ExtractDefinition,
    response: HttpResponseModel,
    hooks: TestRunnerHooks,
  ): Promise<{ name: string; status: 'passed' | 'failed' | 'skipped'; value?: string; message?: string }> {
    let value: string | undefined;
    let message: string | undefined;

    switch (extraction.source) {
      case 'status':
        value = String(response.status);
        break;
      case 'header': {
        const headerValue = getHeader(response.headers, extraction.header ?? '');
        if (headerValue === undefined) {
          message = `Header "${extraction.header}" not present.`;
        } else {
          value = headerValue;
        }
        break;
      }
      case 'jsonPath': {
        const result = extractJsonPath(response.body, extraction.path ?? '');
        if (!result.found) {
          message = `Path "${extraction.path}" not found in response.`;
        } else {
          value = result.value;
        }
        break;
      }
      default:
        message = 'Unknown extraction source.';
    }

    if (value === undefined) {
      return { name: extraction.name, status: 'failed', ...(message ? { message } : {}) };
    }

    try {
      await hooks.onExtract?.(extraction.name, value);
      return { name: extraction.name, status: 'passed', value };
    } catch (error) {
      return {
        name: extraction.name,
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}
