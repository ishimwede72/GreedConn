/**
 * EnvironmentService — environments, variables and active selection.
 */
import { bridge } from './VsCodeBridge';
import type { Environment, EnvironmentVariable, GlobalVariables } from '../../src/types/Environment';

export interface EnvironmentListResult {
  environments: Environment[];
  globals: GlobalVariables;
  activeEnvironmentId: string;
}

export const EnvironmentService = {
  list(): Promise<EnvironmentListResult> {
    return bridge.request('environments.list');
  },

  create(name: string, description?: string): Promise<{ environment: Environment }> {
    return bridge.request('environments.create', { name, ...(description ? { description } : {}) });
  },

  rename(
    environmentId: string,
    name: string,
    description?: string,
  ): Promise<{ environment: Environment }> {
    return bridge.request('environments.rename', {
      environmentId,
      name,
      ...(description !== undefined ? { description } : {}),
    });
  },

  delete(environmentId: string): Promise<{ deleted: boolean }> {
    return bridge.request('environments.delete', { environmentId });
  },

  setActive(environmentId: string): Promise<{ activeEnvironmentId: string }> {
    return bridge.request('environments.setActive', { environmentId });
  },

  upsertVariable(
    environmentId: string,
    variable: Partial<EnvironmentVariable> & { key: string; value: string },
    global = false,
  ): Promise<{ variable: EnvironmentVariable }> {
    return bridge.request('environments.variable.upsert', {
      environmentId,
      variable,
      global,
    });
  },

  deleteVariable(environmentId: string, variableId: string, global = false): Promise<{ deleted: boolean }> {
    return bridge.request('environments.variable.delete', { environmentId, variableId, global });
  },

  import(content: string): Promise<{ imported: number; warnings: string[] }> {
    return bridge.request('environments.import', { content }, 30000);
  },

  export(environmentId: string): Promise<{ fileName: string; content: string }> {
    return bridge.request('environments.export', { environmentId });
  },
};
