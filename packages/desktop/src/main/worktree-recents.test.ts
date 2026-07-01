import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { classifyRecentGit, clearRecentGitCache } from './worktree-recents.ts';

const execFileAsync = promisify(execFile);
const GIT_ENV = { ...process.env, LANG: 'C', LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null' };

async function git(cwd: string, ...args: string[]): Promise<void> {
  await execFileAsync('git', args, { cwd, env: GIT_ENV });
}

interface Handle {
  readonly root: string;
  readonly mainRepo: string;
  readonly worktree: string;
  cleanup(): void;
}

async function makeRepoWithWorktree(): Promise<Handle> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wt-recents-test-')));
  const mainRepo = join(root, 'main');
  mkdirSync(mainRepo);
  await git(mainRepo, 'init', '--initial-branch=main', '.');
  await git(mainRepo, 'config', 'user.email', 'test@example.com');
  await git(mainRepo, 'config', 'user.name', 'Test');
  writeFileSync(join(mainRepo, 'README.md'), '# main\n');
  await git(mainRepo, 'add', '-A');
  await git(mainRepo, 'commit', '-m', 'initial');
  const worktree = join(root, 'wt', 'feature');
  mkdirSync(join(root, 'wt'), { recursive: true });
  await git(mainRepo, 'worktree', 'add', '-b', 'feature', worktree);
  return {
    root,
    mainRepo,
    worktree,
    cleanup: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('classifyRecentGit', () => {
  let handle: Handle | null = null;
  beforeEach(() => clearRecentGitCache());
  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  test('main worktree: same repo, not linked', async () => {
    handle = await makeRepoWithWorktree();
    const info = classifyRecentGit(handle.mainRepo);
    expect(info.gitCommonDir).toBe(join(handle.mainRepo, '.git'));
    expect(info.mainRoot).toBe(handle.mainRepo);
    expect(info.isLinkedWorktree).toBe(false);
  });

  test('linked worktree: shares the main repo common-dir + main root, flagged linked', async () => {
    handle = await makeRepoWithWorktree();
    const info = classifyRecentGit(handle.worktree);
    expect(info.gitCommonDir).toBe(join(handle.mainRepo, '.git'));
    expect(info.mainRoot).toBe(handle.mainRepo);
    expect(info.isLinkedWorktree).toBe(true);
  });

  test('main + linked worktree share the same gitCommonDir (grouping key)', async () => {
    handle = await makeRepoWithWorktree();
    const main = classifyRecentGit(handle.mainRepo);
    const linked = classifyRecentGit(handle.worktree);
    expect(main.gitCommonDir).toBe(linked.gitCommonDir);
  });

  test('non-git dir → empty classification', () => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'wt-recents-nogit-')));
    try {
      const info = classifyRecentGit(tmp);
      expect(info.gitCommonDir).toBeNull();
      expect(info.mainRoot).toBeNull();
      expect(info.isLinkedWorktree).toBe(false);
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test('non-absolute path → empty', () => {
    expect(classifyRecentGit('relative/path').gitCommonDir).toBeNull();
  });

  test('result is memoized per path (cache hit after clear + recompute)', async () => {
    handle = await makeRepoWithWorktree();
    const first = classifyRecentGit(handle.mainRepo);
    const second = classifyRecentGit(handle.mainRepo);
    expect(first).toBe(second);
  });
});
