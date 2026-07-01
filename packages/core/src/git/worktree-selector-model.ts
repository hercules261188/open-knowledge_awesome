import type { BridgeWorktreeEntry } from './worktree-list-parser.ts';

export interface WorktreeSelectorEntry {
  readonly branch: string | null;
  readonly worktreePath: string | null;
  readonly isCurrent: boolean;
  readonly isMain: boolean;
  readonly locked: boolean;
}

export interface WorktreeSelectorModel {
  readonly mainRoot: string;
  readonly currentBranch: string | null;
  readonly entries: readonly WorktreeSelectorEntry[];
}

export type WorktreeListResult =
  | { readonly ok: true; readonly model: WorktreeSelectorModel }
  | { readonly ok: false; readonly reason: 'no-git' };

export interface WorktreeCreateRequest {
  readonly branch: string;
  readonly baseBranch?: string | null;
  readonly createBranch: boolean;
}

export type WorktreeCreateResult =
  | { readonly ok: true; readonly path: string; readonly created: boolean }
  | {
      readonly ok: false;
      readonly reason:
        | 'invalid-branch'
        | 'branch-exists'
        | 'already-checked-out'
        | 'path-exists'
        | 'no-git'
        | 'error';
      readonly message?: string;
    };

export interface BuildWorktreeSelectorModelInput {
  readonly worktrees: readonly BridgeWorktreeEntry[];
  readonly branches: readonly string[];
  readonly currentProjectPath: string;
}

export function buildWorktreeSelectorModel(
  input: BuildWorktreeSelectorModelInput,
): WorktreeSelectorModel {
  const liveWorktrees = input.worktrees.filter((w) => !w.prunable);
  const mainRoot = liveWorktrees[0]?.path ?? input.currentProjectPath;

  const worktreeByBranch = new Map<string, BridgeWorktreeEntry>();
  for (const w of liveWorktrees) {
    if (w.branch !== null && !worktreeByBranch.has(w.branch)) {
      worktreeByBranch.set(w.branch, w);
    }
  }

  const isCurrentPath = (p: string): boolean => p === input.currentProjectPath;

  const entries: WorktreeSelectorEntry[] = [];

  for (const branch of input.branches) {
    const wt = worktreeByBranch.get(branch) ?? null;
    entries.push({
      branch,
      worktreePath: wt?.path ?? null,
      isCurrent: wt !== null && isCurrentPath(wt.path),
      isMain: wt !== null && wt.path === mainRoot,
      locked: wt?.locked ?? false,
    });
  }

  const branchPaths = new Set(
    entries.map((e) => e.worktreePath).filter((p): p is string => p !== null),
  );
  for (const w of liveWorktrees) {
    if (w.branch === null && !branchPaths.has(w.path)) {
      entries.push({
        branch: null,
        worktreePath: w.path,
        isCurrent: isCurrentPath(w.path),
        isMain: w.path === mainRoot,
        locked: w.locked,
      });
    }
  }

  const currentBranch = entries.find((e) => e.isCurrent)?.branch ?? null;

  entries.sort(compareEntries);

  return { mainRoot, currentBranch, entries };
}

function compareEntries(a: WorktreeSelectorEntry, b: WorktreeSelectorEntry): number {
  const rank = (e: WorktreeSelectorEntry): number => {
    if (e.isCurrent) return 0;
    if (e.isMain) return 1;
    if (e.worktreePath !== null) return 2;
    return 3;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return (a.branch ?? '').localeCompare(b.branch ?? '');
}
