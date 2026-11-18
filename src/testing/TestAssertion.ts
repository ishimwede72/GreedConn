/**
 * TestAssertion — dispatcher that routes an assertion definition to its
 * evaluator. Kept as a single entry point so TestRunner stays declarative.
 */
import type { AssertionDefinition, AssertionResult } from '../types/Testing';
import type { HttpResponseModel } from '../types/Response';
import { evaluateStatus } from './assertions/StatusAssertion';
import { evaluateResponseTime } from './assertions/ResponseTimeAssertion';
import { evaluateBody } from './assertions/BodyAssertion';
import { evaluateHeader } from './assertions/HeaderAssertion';
import { evaluateJsonPath } from './assertions/JsonPathAssertion';

export interface AssertionContext {
  response: HttpResponseModel;
}

export function evaluateAssertion(
  assertion: AssertionDefinition,
  context: AssertionContext,
): AssertionResult {
  const { response } = context;
  try {
    switch (assertion.type) {
      case 'status':
        return evaluateStatus(assertion, response.status);
      case 'responseTime':
        return evaluateResponseTime(assertion, response.responseTime);
      case 'body':
        return evaluateBody(assertion, response.body);
      case 'header':
        return evaluateHeader(assertion, response.headers);
      case 'jsonPath':
        return evaluateJsonPath(assertion, response.body);
      default: {
        const exhaustive: never = assertion;
        return {
          type: 'status',
          description: 'Unknown assertion',
          status: 'error',
          message: `Unsupported assertion type: ${JSON.stringify(exhaustive)}`,
        };
      }
    }
  } catch (error) {
    return {
      type: assertion.type,
      description: `${assertion.type} assertion`,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
