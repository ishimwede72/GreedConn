/**
 * EnvironmentRepository — CRUD over the environments.json document.
 */
import type { Environment, EnvironmentVariable, GlobalVariables } from '../types/Environment';
import type { StorageProvider } from '../types/Storage';
import { generateEnvironmentId, generateVariableId } from '../utils/IdGenerator';
import { nowIso } from '../utils/DateUtils';
import { SCHEMA_VERSION } from '../types/Storage';

const FILE = 'environments.json';

interface EnvironmentsDocument {
  environments: Environment[];
  globals: GlobalVariables;
  activeEnvironmentId: string;
}

function emptyDocument(): EnvironmentsDocument {
  return {
    environments: [],
    globals: { variables: [], updatedAt: nowIso() },
    activeEnvironmentId: '',
  };
}

export class EnvironmentRepository {
  private cache: EnvironmentsDocument | null = null;
  private loading: Promise<EnvironmentsDocument> | null = null;

  constructor(private readonly storage: StorageProvider) {}

  private async load(): Promise<EnvironmentsDocument> {
    if (this.cache) return this.cache;
    if (!this.loading) {
      this.loading = (async () => {
        const result = await this.storage.read<Partial<EnvironmentsDocument>>(FILE);
        const data = result.data ?? {};
        const doc: EnvironmentsDocument = {
          environments: Array.isArray(data.environments)
            ? (data.environments as Environment[])
            : [],
          globals:
            data.globals && typeof data.globals === 'object'
              ? (data.globals as GlobalVariables)
              : { variables: [], updatedAt: nowIso() },
          activeEnvironmentId:
            typeof data.activeEnvironmentId === 'string' ? data.activeEnvironmentId : '',
        };
        // Guard against dangling active environment.
        if (
          doc.activeEnvironmentId &&
          !doc.environments.some((e) => e.id === doc.activeEnvironmentId)
        ) {
          doc.activeEnvironmentId = '';
        }
        this.cache = doc;
        return doc;
      })();
    }
    return this.loading;
  }

  private async persist(): Promise<void> {
    if (!this.cache) return;
    this.cache.globals.updatedAt = nowIso();
    await this.storage.write(FILE, this.cache);
  }

  async list(): Promise<Environment[]> {
    const doc = await this.load();
    return doc.environments.map((env) => ({ ...env, variables: [...env.variables] }));
  }

  async get(id: string): Promise<Environment | null> {
    const doc = await this.load();
    const env = doc.environments.find((e) => e.id === id);
    return env ? { ...env, variables: [...env.variables] } : null;
  }

  async getActive(): Promise<Environment | null> {
    const doc = await this.load();
    if (!doc.activeEnvironmentId) return null;
    return this.get(doc.activeEnvironmentId);
  }

  async getActiveId(): Promise<string> {
    const doc = await this.load();
    return doc.activeEnvironmentId;
  }

  async create(name: string, description?: string): Promise<Environment> {
    const doc = await this.load();
    const now = nowIso();
    const environment: Environment = {
      id: generateEnvironmentId(),
      name: name.trim() || 'New Environment',
      ...(description ? { description } : {}),
      variables: [],
      createdAt: now,
      updatedAt: now,
      version: SCHEMA_VERSION,
    };
    doc.environments.push(environment);
    if (!doc.activeEnvironmentId) doc.activeEnvironmentId = environment.id;
    await this.persist();
    return { ...environment, variables: [] };
  }

  async rename(id: string, name: string, description?: string): Promise<Environment | null> {
    const doc = await this.load();
    const env = doc.environments.find((e) => e.id === id);
    if (!env) return null;
    env.name = name.trim() || env.name;
    if (description !== undefined) env.description = description;
    env.updatedAt = nowIso();
    await this.persist();
    return { ...env, variables: [...env.variables] };
  }

  async delete(id: string): Promise<boolean> {
    const doc = await this.load();
    const index = doc.environments.findIndex((e) => e.id === id);
    if (index === -1) return false;
    doc.environments.splice(index, 1);
    if (doc.activeEnvironmentId === id) {
      doc.activeEnvironmentId = doc.environments[0]?.id ?? '';
    }
    await this.persist();
    return true;
  }

  async setActive(id: string): Promise<string> {
    const doc = await this.load();
    if (id === '') {
      doc.activeEnvironmentId = '';
    } else if (doc.environments.some((e) => e.id === id)) {
      doc.activeEnvironmentId = id;
    } else {
      throw new Error('Environment not found.');
    }
    await this.persist();
    return doc.activeEnvironmentId;
  }

  async upsertVariable(
    environmentId: string,
    variable: EnvironmentVariable,
    options: { global?: boolean } = {},
  ): Promise<EnvironmentVariable | null> {
    const doc = await this.load();
    const target = options.global
      ? doc.globals
      : doc.environments.find((e) => e.id === environmentId);
    if (!target) return null;

    const existingIndex = target.variables.findIndex((v) => v.id === variable.id);
    const normalized: EnvironmentVariable = {
      ...variable,
      id: variable.id || generateVariableId(),
      key: variable.key.trim(),
      enabled: variable.enabled !== false,
    };
    if (existingIndex >= 0) {
      target.variables[existingIndex] = normalized;
    } else {
      // Prevent duplicate keys (last write wins for the same key).
      const keyIndex = target.variables.findIndex((v) => v.key === normalized.key);
      if (keyIndex >= 0) {
        normalized.id = target.variables[keyIndex].id;
        target.variables[keyIndex] = normalized;
      } else {
        target.variables.push(normalized);
      }
    }
    if (!options.global) {
      const env = doc.environments.find((e) => e.id === environmentId);
      if (env) env.updatedAt = nowIso();
    }
    await this.persist();
    return normalized;
  }

  async deleteVariable(
    environmentId: string,
    variableId: string,
    options: { global?: boolean } = {},
  ): Promise<boolean> {
    const doc = await this.load();
    const target = options.global
      ? doc.globals
      : doc.environments.find((e) => e.id === environmentId);
    if (!target) return false;
    const index = target.variables.findIndex((v) => v.id === variableId);
    if (index === -1) return false;
    target.variables.splice(index, 1);
    await this.persist();
    return true;
  }

  async getGlobals(): Promise<GlobalVariables> {
    const doc = await this.load();
    return { ...doc.globals, variables: [...doc.globals.variables] };
  }

  async replaceAll(environments: Environment[], activeId?: string): Promise<void> {
    const doc = await this.load();
    doc.environments = environments;
    if (activeId !== undefined) doc.activeEnvironmentId = activeId;
    await this.persist();
  }

  async getDocument(): Promise<EnvironmentsDocument> {
    return this.load();
  }
}
