import { execFile, execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { promisify } from 'node:util';
import {
  buildWorktreeSelectorModel,
  parseBranchList,
  WORKTREES_PARENT_DIR,
  type WorktreeCreateRequest,
  type WorktreeCreateResult,
  type WorktreeListResult,
  worktreeRelativeDir,
} from '@inkeep/open-knowledge-core';
import { listGitWorktrees } from './list-git-worktrees.ts';

const execFileAsync = promisify(execFile);

/** English-stable git env — mirrors `list-git-worktrees.ts` so stderr
 *  classification survives a non-English host locale. */
const GIT_ENV = { ...process.env, LANG: 'C', LC_ALL: 'C' } as const;

export type { WorktreeCreateResult, WorktreeListResult };

export interface CreateWorktreeArgs extends WorktreeCreateRequest {
  readonly anchorPath: string;
}

export async function listWorktreeSelector(
  anchorPath: string,
  currentProjectPath: string,
): Promise<WorktreeListResult> {
  const worktrees = await listGitWorktrees(anchorPath);
  if (worktrees.length === 0) return { ok: false, reason: 'no-git' };
  const branches = await listLocalBranches(anchorPath);
  const model = buildWorktreeSelectorModel({ worktrees, branches, currentProjectPath });
  return { ok: true, model };
}

export async function createWorktree(args: CreateWorktreeArgs): Promise<WorktreeCreateResult> {
  const rel = worktreeRelativeDir(args.branch);
  if (rel === null || !isAbsolute(args.anchorPath)) {
    return { ok: false, reason: 'invalid-branch' };
  }

  const worktrees = await listGitWorktrees(args.anchorPath);
  if (worktrees.length === 0) return { ok: false, reason: 'no-git' };
  const mainRoot = worktrees[0]?.path;
  if (mainRoot === undefined) return { ok: false, reason: 'no-git' };

  const existing = worktrees.find((w) => !w.prunable && w.branch === args.branch.trim());
  if (existing) return { ok: true, path: existing.path, created: false };

  const worktreePath = join(mainRoot, rel);

  ensureWorktreesExcluded(args.anchorPath);

  const addArgs = args.createBranch
    ? [
        'worktree',
        'add',
        '-b',
        args.branch.trim(),
        worktreePath,
        ...(args.baseBranch ? [args.baseBranch] : []),
      ]
    : ['worktree', 'add', worktreePath, args.branch.trim()];

  try {
    await execFileAsync('git', addArgs, { cwd: args.anchorPath, env: GIT_ENV });
    return { ok: true, path: worktreePath, created: true };
  } catch (err) {
    return { ok: false, ...classifyAddError(err) };
  }
}

async function listLocalBranches(anchorPath: string): Promise<string[]> {
  if (!isAbsolute(anchorPath)) return [];
  try {
    const { stdout } = await execFileAsync(
      'git',
      ['for-each-ref', '--format=%(refname:short)', 'refs/heads/'],
      { cwd: anchorPath, env: GIT_ENV },
    );
    return parseBranchList(String(stdout));
  } catch {
    return [];
  }
}

function ensureWorktreesExcluded(anchorPath: string): void {
  try {
    const commonDir = execFileSyncTrim(
      'git',
      ['rev-parse', '--path-format=absolute', '--git-common-dir'],
      anchorPath,
    );
    if (commonDir === null) return;
    const excludePath = join(commonDir, 'info', 'exclude');
    const line = `/${WORKTREES_PARENT_DIR}/`;
    let current = '';
    try {
      current = readFileSync(excludePath, 'utf-8');
    } catch {}
    if (current.split('\n').some((l) => l.trim() === line)) return;
    const prefix = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
    appendFileSync(excludePath, `${prefix}${line}\n`);
  } catch {}
}

function execFileSyncTrim(cmd: string, cmdArgs: string[], cwd: string): string | null {
  try {
    return String(execFileSync(cmd, cmdArgs, { cwd, env: GIT_ENV })).trim();
  } catch {
    return null;
  }
}

interface ExecErr {
  stderr?: string | Buffer;
  message?: string;
}

interface AddErrorClassification {
  readonly reason: 'branch-exists' | 'already-checked-out' | 'path-exists' | 'error';
  readonly message?: string;
}

function classifyAddError(err: unknown): AddErrorClassification {
  const e = typeof err === 'object' && err !== null ? (err as ExecErr) : null;
  const stderrRaw = e?.stderr;
  const raw: string =
    stderrRaw !== undefined && stderrRaw !== null
      ? Buffer.isBuffer(stderrRaw)
        ? stderrRaw.toString('utf-8')
        : String(stderrRaw)
      : String(e?.message ?? err);
  const stderr = raw.toLowerCase();
  if (stderr.includes('already checked out')) return { reason: 'already-checked-out' };
  if (stderr.includes('already exists') && stderr.includes('branch')) {
    return { reason: 'branch-exists' };
  }
  if (stderr.includes('already exists')) return { reason: 'path-exists' };
  return { reason: 'error', message: raw.replace(/\s+/g, ' ').slice(0, 300) };
}
