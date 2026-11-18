/**
 * Generic validation helpers used by message validation and storage loads.
 */

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown, maxLength = 10000): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength;
}

export function isString(value: unknown, maxLength = 1_000_000): value is string {
  return typeof value === 'string' && value.length <= maxLength;
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isStringArray(value: unknown, max = 1000): value is string[] {
  return Array.isArray(value) && value.length <= max && value.every((v) => typeof v === 'string');
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/** Collect issues instead of throwing on the first problem. */
export class Validator {
  readonly issues: ValidationIssue[] = [];

  check(condition: boolean, path: string, message: string): boolean {
    if (!condition) this.issues.push({ path, message });
    return condition;
  }

  get ok(): boolean {
    return this.issues.length === 0;
  }

  throwIfInvalid(context = 'validation'): void {
    if (!this.ok) {
      const detail = this.issues.map((i) => `${i.path}: ${i.message}`).join('; ');
      throw new Error(`${context} failed — ${detail}`);
    }
  }

  firstError(): string | null {
    if (this.ok) return null;
    const first = this.issues[0];
    return `${first.path}: ${first.message}`;
  }
}

/** Clamp a number into [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
