import { afterEach, describe, expect, test } from 'bun:test';
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { clearRecentGitCache } from './worktree-recents.ts';
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

async function addBareRemote(mainRepo: string, pushBranches: string[]): Promise<string> {
  const bare = join(mainRepo, '..', 'origin.git');
  await git(mainRepo, 'init', '--bare', '--initial-branch=main', bare);
  await git(mainRepo, 'remote', 'add', 'origin', bare);
  for (const b of pushBranches) await git(mainRepo, 'push', 'origin', b);
  await git(mainRepo, 'fetch', 'origin');
  return bare;
}

describe('worktree-service', () => {
  let handle: Handle | null = null;
  afterEach(() => {
    handle?.cleanup();
    handle = null;
    clearRecentGitCache();
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

  test('listWorktreeSelector flags isCurrent when the anchor is a subdirectory of the worktree', async () => {
    handle = await makeRepo(['dev']);
    const contentDir = join(handle.mainRepo, 'public', 'ok');
    mkdirSync(contentDir, { recursive: true });
    const res = await listWorktreeSelector(contentDir, contentDir);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.model.mainRoot).toBe(handle.mainRepo);
    const main = res.model.entries.find((e) => e.branch === 'main');
    expect(main?.isCurrent).toBe(true);
    expect(res.model.currentBranch).toBe('main');
  });

  test('listWorktreeSelector prefers the deepest containing worktree for a nested anchor', async () => {
    handle = await makeRepo(['dev']);
    const dev = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: false,
    });
    expect(dev.ok).toBe(true);
    if (!dev.ok) return;
    const sub = join(dev.path, 'public', 'ok');
    mkdirSync(sub, { recursive: true });
    const res = await listWorktreeSelector(sub, sub);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byBranch = new Map(res.model.entries.map((e) => [e.branch, e]));
    expect(byBranch.get('dev')?.isCurrent).toBe(true);
    expect(byBranch.get('main')?.isCurrent).toBe(false);
    expect(res.model.currentBranch).toBe('dev');
  });

  test('createWorktree does not let a dash-prefixed branch inject a git flag (checkout arm)', async () => {
    handle = await makeRepo();
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: '--detach',
      createBranch: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('error');
    const list = await git(handle.mainRepo, 'worktree', 'list', '--porcelain');
    expect(list).not.toContain('detached');
    expect(list).not.toContain('.ok/worktrees/--detach');
  });

  test('createWorktree guards a dash-prefixed baseBranch in the create arm', async () => {
    handle = await makeRepo();
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'brand-new',
      baseBranch: '--detach',
      createBranch: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('error');
    const branches = await git(handle.mainRepo, 'branch', '--list', 'brand-new');
    expect(branches).not.toContain('brand-new');
  });

  test('createWorktree classifies a duplicate-branch create as branch-exists', async () => {
    handle = await makeRepo(['dev']);
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('branch-exists');
  });

  test('createWorktree classifies a pre-existing target dir as path-exists', async () => {
    handle = await makeRepo(['dev']);
    const target = join(handle.mainRepo, '.ok', 'worktrees', 'dev');
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, 'squatter.txt'), 'in the way\n');
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'dev',
      createBranch: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('path-exists');
  });

  test('createWorktree surfaces an unrecognized git failure as error with a message', async () => {
    handle = await makeRepo();
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'does-not-exist-branch',
      createBranch: false,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('error');
    expect(typeof res.message).toBe('string');
    expect((res.message ?? '').length).toBeGreaterThan(0);
  });

  test('listWorktreeSelector surfaces origin/<x> remote refs and drops origin/HEAD', async () => {
    handle = await makeRepo(['dev', 'feature-x']);
    await addBareRemote(handle.mainRepo, ['main', 'dev', 'feature-x']);
    await git(handle.mainRepo, 'remote', 'set-head', 'origin', 'main');
    const res = await listWorktreeSelector(handle.mainRepo, handle.mainRepo);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const remotes = res.model.remoteBranches;
    expect(remotes).toContain('origin/main');
    expect(remotes).toContain('origin/dev');
    expect(remotes).toContain('origin/feature-x');
    expect(remotes).not.toContain('origin/HEAD');
    expect(remotes).not.toContain('origin');
  });

  test('listWorktreeSelector computes per-branch behind-origin counts (no network)', async () => {
    handle = await makeRepo(['dev']);
    await addBareRemote(handle.mainRepo, ['main', 'dev']);
    const scratch = join(handle.root, 'scratch');
    await git(handle.root, 'clone', join(handle.mainRepo, '..', 'origin.git'), scratch);
    await git(scratch, 'config', 'user.email', 'test@example.com');
    await git(scratch, 'config', 'user.name', 'Test');
    writeFileSync(join(scratch, 'a.txt'), 'a\n');
    await git(scratch, 'add', '-A');
    await git(scratch, 'commit', '-m', 'a');
    writeFileSync(join(scratch, 'b.txt'), 'b\n');
    await git(scratch, 'add', '-A');
    await git(scratch, 'commit', '-m', 'b');
    await git(scratch, 'push', 'origin', 'main');
    await git(handle.mainRepo, 'fetch', 'origin');

    const res = await listWorktreeSelector(handle.mainRepo, handle.mainRepo);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const byBranch = new Map(res.model.entries.map((e) => [e.branch, e]));
    expect(byBranch.get('main')?.behind).toBe(2);
    expect(byBranch.get('dev')?.behind).toBe(0);
  });

  test('createWorktree (remoteRef) creates a local tracking branch off origin/<x> with remote content', async () => {
    handle = await makeRepo();
    await addBareRemote(handle.mainRepo, ['main']);
    const scratch = join(handle.root, 'scratch');
    await git(handle.root, 'clone', join(handle.mainRepo, '..', 'origin.git'), scratch);
    await git(scratch, 'config', 'user.email', 'test@example.com');
    await git(scratch, 'config', 'user.name', 'Test');
    await git(scratch, 'checkout', '-b', 'feature-x');
    writeFileSync(join(scratch, 'remote-only.txt'), 'from remote\n');
    await git(scratch, 'add', '-A');
    await git(scratch, 'commit', '-m', 'remote-only feature');
    await git(scratch, 'push', 'origin', 'feature-x');
    await git(handle.mainRepo, 'fetch', 'origin');

    const localBefore = await git(handle.mainRepo, 'branch', '--list', 'feature-x');
    expect(localBefore.trim()).toBe('');

    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'feature-x',
      remoteRef: 'origin/feature-x',
      createBranch: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.created).toBe(true);
    expect(res.path).toBe(join(handle.mainRepo, '.ok', 'worktrees', 'feature-x'));
    expect(existsSync(join(res.path, 'remote-only.txt'))).toBe(true);
    const upstream = await git(
      res.path,
      'rev-parse',
      '--abbrev-ref',
      '--symbolic-full-name',
      '@{upstream}',
    );
    expect(upstream.trim()).toBe('origin/feature-x');
  });

  test('createWorktree (baseRef, --no-track) bases a new branch on origin/<x> without tracking it', async () => {
    handle = await makeRepo();
    await addBareRemote(handle.mainRepo, ['main']);
    const scratch = join(handle.root, 'scratch');
    await git(handle.root, 'clone', join(handle.mainRepo, '..', 'origin.git'), scratch);
    await git(scratch, 'config', 'user.email', 'test@example.com');
    await git(scratch, 'config', 'user.name', 'Test');
    writeFileSync(join(scratch, 'fresh.txt'), 'fresh from origin\n');
    await git(scratch, 'add', '-A');
    await git(scratch, 'commit', '-m', 'fresh commit on origin/main');
    await git(scratch, 'push', 'origin', 'main');
    await git(handle.mainRepo, 'fetch', 'origin');

    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: 'my-feature',
      baseRef: 'origin/main',
      createBranch: true,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(existsSync(join(res.path, 'fresh.txt'))).toBe(true);
    let upstreamErr = '';
    try {
      await git(res.path, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
    } catch (e) {
      upstreamErr = String((e as { stderr?: string }).stderr ?? e);
    }
    expect(upstreamErr).not.toBe('');
    const branchList = await git(handle.mainRepo, 'branch', '--list', 'my-feature');
    expect(branchList).toContain('my-feature');
  });

  test('createWorktree (remoteRef) rejects a path-escaping branch name before spawning git', async () => {
    handle = await makeRepo();
    const res = await createWorktree({
      anchorPath: handle.mainRepo,
      branch: '../evil',
      remoteRef: 'origin/evil',
      createBranch: true,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid-branch');
  });
});
