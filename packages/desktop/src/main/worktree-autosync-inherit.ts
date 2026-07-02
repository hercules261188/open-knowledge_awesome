import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { resolveConfigPath, writeConfigPatch } from '@inkeep/open-knowledge-core/server';
import { parse as parseYaml } from 'yaml';
import { getLogger } from './desktop-logger.ts';

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function readAutoSyncBool(path: string, key: 'enabled' | 'default'): boolean | null {
  if (!existsSync(path)) return null;
  let parsed: unknown;
  try {
    parsed = parseYaml(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
  if (!isObject(parsed)) return null;
  const autoSync = parsed.autoSync;
  if (!isObject(autoSync)) return null;
  const value = autoSync[key];
  return typeof value === 'boolean' ? value : null;
}

export function resolveRootAutoSync(mainRoot: string): boolean | null {
  const enabled = readAutoSyncBool(resolveConfigPath('project-local', mainRoot), 'enabled');
  if (enabled !== null) return enabled;
  return readAutoSyncBool(resolveConfigPath('project', mainRoot), 'default');
}

export async function seedWorktreeAutoSync(worktreePath: string, mainRoot: string): Promise<void> {
  const inherited = resolveRootAutoSync(mainRoot);
  if (inherited === null) return;
  const result = await writeConfigPatch({
    cwd: worktreePath,
    scope: 'project-local',
    patch: {
      autoSync: {
        enabled: inherited,
        inheritedNoticePending: true,
        inheritedFrom: basename(mainRoot),
      },
    },
  });
  if (!result.ok) {
    getLogger('worktree-autosync').warn(
      { worktreePath, reason: result.error.code },
      'failed to seed inherited autoSync.enabled',
    );
  }
}
