import { afterEach, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { createWorktree, listWorktreeSelector } from './worktree-service.ts';

const execFileAsync = promisify(execFile);
const GIT_ENV = { ...process.env, LANG: 'C', LC_ALL: 'C', GIT_CONFIG_GLOBAL: '/dev/null' };

async function git(cwd: string, ...args: string[]): Promise<string> {
  const { stdout } = await execFileAsync('git', args, { cwd, env: GIT_ENV });
  return String(stdout);
}

interface Handle {
  readonly root: string;
  readonly mainRepo: string;
  cleanup(): void;
}

/** A clean main repo on `main` with a committed README + `.ok/config.yml` so a
 *  worktree checked out from it carries the OK config (mirrors production). */
async function makeRepo(extraBranches: string[] = []): Promise<Handle> {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wt-svc-test-')));
  const mainRepo = join(root, 'main');
  mkdirSync(mainRepo);
  await git(mainRepo, 'init', '--initial-branch=main', '.');
  await git(mainRepo, 'config', 'user.email', 'test@example.com');
  await git(mainRepo, 'config', 'user.name', 'Test');
  mkdirSync(join(mainRepo, '.ok'));
  writeFileSync(join(mainRepo, '.ok', 'config.yml'), 'version: 1\n');
  writeFileSync(join(mainRepo, 'README.md'), '# main\n');
  await git(mainRepo, 'add', '-A');
  await git(mainRepo, 'commit', '-m', 'initial');
  for (const b of extraBranches) await git(mainRepo, 'branch', b);
  return { root, mainRepo, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

describe('worktree-service', () => {
  let handle: Handle | null = null;
  afterEach(() => {
    handle?.cleanup();
    handle = null;
  });

  test('listWorktreeSelector returns every branch, flags current + main', async () => {
    handle = await makeRepo(['dev', 'feature-x']);
    const res = await listWorktreeSelector(handle.mainRepo, handle.mainRepo);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model.mainRoot).toBe(handle.mainRepo);
    const byBranch = new Map(res.model.entries.map((e) => [e.branch, e]));
    expect(byBranch.get('main')?.isMain).toBe(true);
    expect(byBranch.get('main')?.isCurrent).toBe(true);
    expect(byBranch.get('dev')?.worktreePath).toBeNull();
    expect(byBranch.get('feature-x')?.worktreePath).toBeNull();
  });

  test('createWorktree (existing branch) checks it out under .ok/worktrees/ and carries the OK config', async () => {
    handle = await makeRepo(['dev']);
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: false,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    expect(res.path).toBe(join(handle.mainRepo, '.ok', 'worktrees', 'dev'));
    expect(existsSync(join(res.path, 'README.md'))).toBe(true);
    expect(existsSync(join(res.path, '.ok', 'config.yml'))).toBe(true);
    const status = await git(handle.mainRepo, 'status', '--porcelain');
    expect(status).not.toContain('.ok/worktrees');
  });

  test('createWorktree (-b) creates a new branch + worktree from HEAD', async () => {
    handle = await makeRepo();
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'brand-new',
      createBranch: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    const branches = await git(handle.mainRepo, 'branch', '--list', 'brand-new');
    expect(branches).toContain('brand-new');
  });

  test('createWorktree returns the existing path (created:false) when the branch already has a worktree', async () => {
    handle = await makeRepo(['dev']);
    const first = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: false,
    });
    expect(first.ok).toBe(true);
    const second = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: false,
    });
    expect(second.ok).toBe(true);
    if (!second.ok || !first.ok) return;
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
  });

  test('createWorktree from inside a linked worktree still anchors under the MAIN root', async () => {
    handle = await makeRepo(['dev', 'other']);
    const dev = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: false,
    });
    expect(dev.ok).toBe(true);
    if (!dev.ok) return;
    const other = await createWorktree({
      anchorPath: dev.path,
      branch: 'other',
      createBranch: false,
    });
    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.path).toBe(join(handle.mainRepo, '.ok', 'worktrees', 'other'));
  });

  test('createWorktree rejects a path-escaping branch name', async () => {
    handle = await makeRepo();
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: '../evil',
      createBranch: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid-branch');
  });

  test('listWorktreeSelector on a non-git dir returns no-git', async () => {
    const tmp = realpathSync(mkdtempSync(join(tmpdir(), 'wt-svc-nogit-')));
    try {
      const res = await listWorktreeSelector(tmp, tmp);
      expect(res.ok).toBe(false);
      if (res.ok) return;
      expect(res.reason).toBe('no-git');
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});
