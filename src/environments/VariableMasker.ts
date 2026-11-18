/**
 * Variable validation and masking helpers.
 */
import type { EnvironmentVariable } from '../types/Environment';

const VALID_KEY_RE = /^[A-Za-z_][A-Za-z0-9_.-]*$/;
const SENSITIVE_KEY_RE =
  /(token|secret|password|passwd|api[-_]?key|authorization|credential|private|refresh)/i;

export interface VariableValidationIssue {
  key: string;
  message: string;
}

export function validateVariableKey(key: string): VariableValidationIssue | null {
  if (!key.trim()) return { key, message: 'Variable name is required.' };
  if (key.length > 256) return { key, message: 'Variable name is too long (max 256).' };
  if (!VALID_KEY_RE.test(key.trim())) {
    return {
      key,
      message:
        'Variable names must start with a letter or underscore and contain only letters, digits, ".", "-" or "_".',
    };
  }
  return null;
}

export function validateVariable(variable: EnvironmentVariable): VariableValidationIssue | null {
  return validateVariableKey(variable.key);
}

/** Auto-detect whether a variable looks sensitive (used for defaults only). */
export function looksSensitive(key: string): boolean {
  return SENSITIVE_KEY_RE.test(key);
}

/** Mask a value for display: keep at most 2 characters of context. */
export function maskValue(value: string): string {
  if (!value) return '';
  return '••••••••';
}

export function maskVariable(variable: EnvironmentVariable): EnvironmentVariable {
  if (!variable.secret) return variable;
  return { ...variable, value: maskValue(variable.value) };
}

export function maskVariables(variables: EnvironmentVariable[]): EnvironmentVariable[] {
  return variables.map(maskVariable);
}

/** Names of variables that should always be masked when exported/logged. */
export function sensitiveVariableKeys(variables: EnvironmentVariable[]): string[] {
  return variables.filter((v) => v.secret || looksSensitive(v.key)).map((v) => v.key);
}
