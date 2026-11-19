/**
 * EnvironmentManager — application-facing service combining the repository,
 * resolver and masking rules.
 */
import type { Environment, EnvironmentVariable, GlobalVariables } from '../types/Environment';
import type { HttpRequestModel } from '../types/Request';
import { EnvironmentRepository } from './EnvironmentRepository';
import { VariableResolver, findMissingVariables } from './VariableResolver';
import { maskVariables, validateVariable } from './VariableMasker';

export interface ResolvedRequest {
  request: HttpRequestModel;
  issues: ReturnType<VariableResolver['resolveRequest']>['issues'];
  resolved: string[];
}

export class EnvironmentManager {
  constructor(private readonly repository: EnvironmentRepository) {}

  list(): Promise<Environment[]> {
    return this.repository.list();
  }

  get(id: string): Promise<Environment | null> {
    return this.repository.get(id);
  }

  create(name: string, description?: string): Promise<Environment> {
    return this.repository.create(name, description);
  }

  rename(id: string, name: string, description?: string): Promise<Environment | null> {
    return this.repository.rename(id, name, description);
  }

  delete(id: string): Promise<boolean> {
    return this.repository.delete(id);
  }

  reset(): Promise<number> {
    return this.repository.reset();
  }

  setActive(id: string): Promise<string> {
    return this.repository.setActive(id);
  }

  getActiveId(): Promise<string> {
    return this.repository.getActiveId();
  }

  getGlobals(): Promise<GlobalVariables> {
    return this.repository.getGlobals();
  }

  async upsertVariable(
    environmentId: string,
    variable: EnvironmentVariable,
    options: { global?: boolean } = {},
  ): Promise<EnvironmentVariable> {
    const issue = validateVariable(variable);
    if (issue) throw new Error(issue.message);
    const saved = await this.repository.upsertVariable(environmentId, variable, options);
    if (!saved)
      throw new Error(options.global ? 'Global scope unavailable.' : 'Environment not found.');
    return saved;
  }

  async deleteVariable(
    environmentId: string,
    variableId: string,
    options: { global?: boolean } = {},
  ): Promise<boolean> {
    return this.repository.deleteVariable(environmentId, variableId, options);
  }

  /** Environment view for the UI: secret values masked. */
  async getMasked(id: string): Promise<Environment | null> {
    const env = await this.repository.get(id);
    if (!env) return null;
    return { ...env, variables: maskVariables(env.variables) };
  }

  async listMasked(): Promise<Environment[]> {
    const environments = await this.repository.list();
    return environments.map((env) => ({ ...env, variables: maskVariables(env.variables) }));
  }

  async createResolver(environmentId?: string): Promise<VariableResolver> {
    const [environments, globals, activeId] = await Promise.all([
      this.repository.list(),
      this.repository.getGlobals(),
      this.repository.getActiveId(),
    ]);
    return new VariableResolver({
      environments,
      globals: globals.variables,
      activeEnvironmentId: activeId,
      ...(environmentId !== undefined ? { environmentId } : {}),
    });
  }

  /** Resolve all variables in a request for execution. */
  async resolveRequest(
    request: HttpRequestModel,
    environmentId?: string,
  ): Promise<ResolvedRequest> {
    const resolver = await this.createResolver(environmentId);
    return resolver.resolveRequest(request);
  }

  async findMissing(request: HttpRequestModel, environmentId?: string): Promise<string[]> {
    const resolver = await this.createResolver(environmentId);
    return findMissingVariables(request, resolver);
  }

  /**
   * Apply an extracted value into the active environment (used by tests).
   * Creates the variable when it does not exist.
   */
  async setExtractedValue(name: string, value: string): Promise<void> {
    const activeId = await this.repository.getActiveId();
    if (!activeId) return;
    const env = await this.repository.get(activeId);
    if (!env) return;
    const existing = env.variables.find((v) => v.key === name);
    await this.repository.upsertVariable(
      activeId,
      existing
        ? { ...existing, value }
        : {
            id: `var_extracted_${Date.now().toString(36)}`,
            key: name,
            value,
            enabled: true,
          },
    );
  }
}
