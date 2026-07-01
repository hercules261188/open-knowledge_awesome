import { describe, expect, test } from 'bun:test';
import type { RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { basenameOf, groupRecentsByRepo } from './project-switcher-recents.ts';

function main(path: string, commonDir: string): RecentProjectEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    lastOpenedAt: '2026-07-01',
    gitCommonDir: commonDir,
    mainRoot: path,
    isLinkedWorktree: false,
    branch: 'main',
  };
}
function worktree(
  path: string,
  commonDir: string,
  mainRoot: string,
  branch: string,
): RecentProjectEntry {
  return {
    path,
    name: path.split('/').pop() ?? path,
    lastOpenedAt: '2026-07-01',
    gitCommonDir: commonDir,
    mainRoot,
    isLinkedWorktree: true,
    branch,
  };
}
function nonGit(path: string): RecentProjectEntry {
  return { path, name: path.split('/').pop() ?? path, lastOpenedAt: '2026-07-01' };
}

describe('basenameOf', () => {
  test('handles / and \\ and trailing slashes', () => {
    expect(basenameOf('/a/b/test')).toBe('test');
    expect(basenameOf('/a/b/test/')).toBe('test');
    expect(basenameOf('C:\\a\\b\\test')).toBe('test');
    expect(basenameOf('solo')).toBe('solo');
  });
});

describe('groupRecentsByRepo', () => {
  test('groups a repo main + its linked worktrees under one group', () => {
    const groups = groupRecentsByRepo([
      main('/repo', '/repo/.git'),
      worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      worktree('/repo/.ok/worktrees/feat', '/repo/.git', '/repo', 'feat'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.project.path).toBe('/repo');
    expect(groups[0]?.projectSynthesized).toBe(false);
    expect(groups[0]?.worktrees.map((w) => w.branch)).toEqual(['dev', 'feat']);
  });

  test('non-git recents become singleton groups with no worktrees', () => {
    const groups = groupRecentsByRepo([nonGit('/notes'), nonGit('/scratch')]);
    expect(groups).toHaveLength(2);
    expect(groups.every((g) => g.worktrees.length === 0)).toBe(true);
    expect(groups.map((g) => g.project.path)).toEqual(['/notes', '/scratch']);
  });

  test('synthesizes the project row when only a worktree is in recents', () => {
    const groups = groupRecentsByRepo([
      worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.project.path).toBe('/repo');
    expect(groups[0]?.project.name).toBe('repo');
    expect(groups[0]?.projectSynthesized).toBe(true);
    expect(groups[0]?.worktrees).toHaveLength(1);
  });

  test('preserves recents order across groups', () => {
    const groups = groupRecentsByRepo([
      main('/alpha', '/alpha/.git'),
      nonGit('/notes'),
      main('/beta', '/beta/.git'),
      worktree('/alpha/.ok/worktrees/x', '/alpha/.git', '/alpha', 'x'),
    ]);
    expect(groups.map((g) => g.project.path)).toEqual(['/alpha', '/notes', '/beta']);
    expect(groups[0]?.worktrees).toHaveLength(1);
  });

  test('two different repos stay separate', () => {
    const groups = groupRecentsByRepo([
      main('/a', '/a/.git'),
      worktree('/a/.ok/worktrees/x', '/a/.git', '/a', 'x'),
      main('/b', '/b/.git'),
    ]);
    expect(groups).toHaveLength(2);
  });
});
