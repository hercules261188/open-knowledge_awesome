import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, resolve } from 'node:path';

const GIT_ENV = { ...process.env, LANG: 'C', LC_ALL: 'C' } as const;

export interface RecentGitInfo {
  readonly gitCommonDir: string | null;
  readonly mainRoot: string | null;
  readonly isLinkedWorktree: boolean;
}

const EMPTY: RecentGitInfo = { gitCommonDir: null, mainRoot: null, isLinkedWorktree: false };

const cache = new Map<string, RecentGitInfo>();

export function clearRecentGitCache(): void {
  cache.clear();
}

export function classifyRecentGit(projectPath: string): RecentGitInfo {
  if (!isAbsolute(projectPath)) return EMPTY;
  let key: string;
  try {
    key = realpathSync(projectPath);
  } catch {
    return EMPTY;
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const info = computeRecentGit(key);
  cache.set(key, info);
  return info;
}

function computeRecentGit(realPath: string): RecentGitInfo {
  let out: string;
  try {
    out = String(
      execFileSync(
        'git',
        ['rev-parse', '--path-format=absolute', '--show-toplevel', '--git-common-dir'],
        { cwd: realPath, env: GIT_ENV },
      ),
    );
  } catch {
    return EMPTY;
  }
  const [topLevelRaw, commonDirRaw] = out.split('\n');
  const topLevel = topLevelRaw?.trim();
  const commonDir = commonDirRaw?.trim();
  if (!topLevel || !commonDir) return EMPTY;

  const mainRoot = basename(commonDir) === '.git' ? dirname(commonDir) : topLevel;
  const isLinkedWorktree = realpathEq(topLevel, mainRoot) === false;
  return { gitCommonDir: commonDir, mainRoot, isLinkedWorktree };
}

function realpathEq(a: string, b: string): boolean {
  const ra = safeRealpath(a);
  const rb = safeRealpath(b);
  return resolve(ra) === resolve(rb);
}

function safeRealpath(p: string): string {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
}
