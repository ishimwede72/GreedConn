/**
 * Environment and variable model types.
 */

export interface EnvironmentVariable {
  id: string;
  key: string;
  value: string;
  enabled: boolean;
  /** Secret values are masked in the UI and redacted from logs/exports. */
  secret?: boolean;
  description?: string;
}

export interface Environment {
  id: string;
  name: string;
  description?: string;
  variables: EnvironmentVariable[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

/** Global variables apply to every environment. */
export interface GlobalVariables {
  variables: EnvironmentVariable[];
  updatedAt: string;
}

export interface VariableResolutionIssue {
  /** The original {{reference}} text. */
  reference: string;
  variable: string;
  reason: 'missing' | 'circular' | 'malformed' | 'disabled';
  /** Where the reference was found (url, header, body, ...). */
  location: string;
}

export interface VariableResolutionResult {
  value: string;
  issues: VariableResolutionIssue[];
  /** Variables that were substituted (names only, never values). */
  resolved: string[];
}
