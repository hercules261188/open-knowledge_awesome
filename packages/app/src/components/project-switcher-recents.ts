import type { RecentProjectEntry } from '@/lib/desktop-bridge-types';

export interface RecentRepoGroup {
  readonly project: RecentProjectEntry;
  readonly worktrees: readonly RecentProjectEntry[];
  readonly projectSynthesized: boolean;
}

export function basenameOf(path: string): string {
  const segments = path.split(/[/\\]/).filter((s) => s.length > 0);
  return segments.length > 0 ? (segments[segments.length - 1] ?? path) : path;
}

interface GroupBuilder {
  project: RecentProjectEntry | null;
  mainRoot: string;
  worktrees: RecentProjectEntry[];
}

export function groupRecentsByRepo(recents: readonly RecentProjectEntry[]): RecentRepoGroup[] {
  const builders: GroupBuilder[] = [];
  const gitGroupIndex = new Map<string, number>();

  for (const entry of recents) {
    const commonDir = entry.gitCommonDir;
    const mainRoot = entry.mainRoot;
    if (commonDir === undefined || mainRoot === undefined) {
      builders.push({ project: entry, mainRoot: entry.path, worktrees: [] });
      continue;
    }
    let idx = gitGroupIndex.get(commonDir);
    if (idx === undefined) {
      idx = builders.length;
      gitGroupIndex.set(commonDir, idx);
      builders.push({ project: null, mainRoot, worktrees: [] });
    }
    const builder = builders[idx];
    if (builder === undefined) continue;
    if (entry.isLinkedWorktree) builder.worktrees.push(entry);
    else if (builder.project === null) builder.project = entry;
  }

  return builders.map((builder) => {
    const synthesized = builder.project === null;
    const project = builder.project ?? {
      path: builder.mainRoot,
      name: basenameOf(builder.mainRoot),
      lastOpenedAt: '',
    };
    return { project, worktrees: builder.worktrees, projectSynthesized: synthesized };
  });
}
