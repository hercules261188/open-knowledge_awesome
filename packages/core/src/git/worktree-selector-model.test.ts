import { describe, expect, test } from 'bun:test';
import type { BridgeWorktreeEntry } from './worktree-list-parser.ts';
import { buildWorktreeSelectorModel } from './worktree-selector-model.ts';

function wt(partial: Partial<BridgeWorktreeEntry> & { path: string }): BridgeWorktreeEntry {
  return {
    branch: null,
    headSha: 'abc123',
    locked: false,
    prunable: false,
    ...partial,
  };
}

describe('buildWorktreeSelectorModel', () => {
  test('main root is the first worktree entry', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [
        wt({ path: '/repo', branch: 'main' }),
        wt({ path: '/repo/.ok/worktrees/dev', branch: 'dev' }),
      ],
      branches: ['main', 'dev'],
      currentProjectPath: '/repo',
    });
    expect(model.mainRoot).toBe('/repo');
  });

  test('every local branch yields an entry; worktree-backed branches carry their path', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [
        wt({ path: '/repo', branch: 'main' }),
        wt({ path: '/repo/.ok/worktrees/dev', branch: 'dev' }),
      ],
      branches: ['main', 'dev', 'feature-x'],
      currentProjectPath: '/repo',
    });
    const byBranch = new Map(model.entries.map((e) => [e.branch, e]));
    expect(byBranch.get('main')?.worktreePath).toBe('/repo');
    expect(byBranch.get('dev')?.worktreePath).toBe('/repo/.ok/worktrees/dev');
    expect(byBranch.get('feature-x')?.worktreePath).toBeNull();
  });

  test('flags the current window and the main worktree', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [
        wt({ path: '/repo', branch: 'main' }),
        wt({ path: '/repo/.ok/worktrees/dev', branch: 'dev' }),
      ],
      branches: ['main', 'dev'],
      currentProjectPath: '/repo/.ok/worktrees/dev',
    });
    const main = model.entries.find((e) => e.branch === 'main');
    const dev = model.entries.find((e) => e.branch === 'dev');
    expect(main?.isMain).toBe(true);
    expect(main?.isCurrent).toBe(false);
    expect(dev?.isCurrent).toBe(true);
    expect(dev?.isMain).toBe(false);
    expect(model.currentBranch).toBe('dev');
  });

  test('orders current first, then main, then worktree-backed, then plain branches', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [
        wt({ path: '/repo', branch: 'main' }),
        wt({ path: '/repo/.ok/worktrees/zeta', branch: 'zeta' }),
      ],
      branches: ['main', 'zeta', 'alpha', 'beta'],
      currentProjectPath: '/repo/.ok/worktrees/zeta',
    });
    expect(model.entries.map((e) => e.branch)).toEqual(['zeta', 'main', 'alpha', 'beta']);
  });

  test('ignores prunable worktrees', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [
        wt({ path: '/repo', branch: 'main' }),
        wt({ path: '/gone', branch: 'ghost', prunable: true }),
      ],
      branches: ['main', 'ghost'],
      currentProjectPath: '/repo',
    });
    expect(model.entries.find((e) => e.branch === 'ghost')?.worktreePath).toBeNull();
  });

  test('includes a detached-HEAD worktree not present in the branch list', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [
        wt({ path: '/repo', branch: 'main' }),
        wt({ path: '/repo/.ok/worktrees/detached', branch: null }),
      ],
      branches: ['main'],
      currentProjectPath: '/repo/.ok/worktrees/detached',
    });
    const detached = model.entries.find((e) => e.worktreePath === '/repo/.ok/worktrees/detached');
    expect(detached?.branch).toBeNull();
    expect(detached?.isCurrent).toBe(true);
  });

  test('falls back to currentProjectPath as mainRoot when no worktrees reported', () => {
    const model = buildWorktreeSelectorModel({
      worktrees: [],
      branches: ['main'],
      currentProjectPath: '/repo',
    });
    expect(model.mainRoot).toBe('/repo');
  });
});
