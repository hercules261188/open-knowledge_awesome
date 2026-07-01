import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NewWorktreeDialog } from './NewWorktreeDialog';

const refreshWorktrees = mock(() => {});
mock.module('@/lib/worktree-store', () => ({ refreshWorktrees }));

function createBridge(createResult: unknown) {
  return {
    worktree: { create: mock(() => Promise.resolve(createResult)) },
    project: { open: mock(() => Promise.resolve()) },
  };
}

const noop = () => {};

describe('NewWorktreeDialog', () => {
  beforeEach(() => {
    cleanup();
    refreshWorktrees.mockClear();
  });

  test('creates a new branch worktree and opens it (entryPoint worktree)', async () => {
    const bridge = createBridge({
      ok: true,
      path: '/repo/.ok/worktrees/my-feature',
      created: true,
    });
    render(
      <NewWorktreeDialog
        open={true}
        onOpenChange={noop}
        bridge={bridge as never}
        currentBranch="main"
      />,
    );
    const input = await screen.findByTestId('new-worktree-branch');
    fireEvent.change(input, { target: { value: 'my-feature' } });
    fireEvent.click(screen.getByTestId('new-worktree-create'));

    await waitFor(() => expect(bridge.worktree.create).toHaveBeenCalledTimes(1));
    expect(bridge.worktree.create).toHaveBeenCalledWith({
      branch: 'my-feature',
      createBranch: true,
      baseBranch: 'main',
    });
    await waitFor(() =>
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/my-feature',
        target: 'new-window',
        entryPoint: 'worktree',
      }),
    );
  });

  test('surfaces a branch-exists failure inline without opening a window', async () => {
    const bridge = createBridge({ ok: false, reason: 'branch-exists' });
    render(
      <NewWorktreeDialog
        open={true}
        onOpenChange={noop}
        bridge={bridge as never}
        currentBranch="main"
      />,
    );
    fireEvent.change(await screen.findByTestId('new-worktree-branch'), {
      target: { value: 'dev' },
    });
    fireEvent.click(screen.getByTestId('new-worktree-create'));
    const err = await screen.findByTestId('new-worktree-error');
    expect(err.textContent).toContain('already exists');
    expect(bridge.project.open).not.toHaveBeenCalled();
  });

  test('checks out an existing branch (createBranch false, no base) and refreshes the cache', async () => {
    const bridge = createBridge({
      ok: true,
      path: '/repo/.ok/worktrees/dev',
      created: false,
    });
    render(
      <NewWorktreeDialog
        open={true}
        onOpenChange={noop}
        bridge={bridge as never}
        currentBranch="main"
        branches={['main', 'dev', 'release']}
      />,
    );
    const input = await screen.findByTestId('new-worktree-branch');
    fireEvent.change(input, { target: { value: 'dev' } });

    expect(screen.getByTestId('new-worktree-create').textContent).toContain('Check out');

    fireEvent.click(screen.getByTestId('new-worktree-create'));
    await waitFor(() => expect(bridge.worktree.create).toHaveBeenCalledTimes(1));
    expect(bridge.worktree.create).toHaveBeenCalledWith({
      branch: 'dev',
      createBranch: false,
      baseBranch: undefined,
    });
    await waitFor(() =>
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/dev',
        target: 'new-window',
        entryPoint: 'worktree',
      }),
    );
    expect(refreshWorktrees).toHaveBeenCalled();
  });

  test('offers existing branches as datalist options for selection', async () => {
    const bridge = createBridge({ ok: true, path: '/x', created: true });
    render(
      <NewWorktreeDialog
        open={true}
        onOpenChange={noop}
        bridge={bridge as never}
        currentBranch="main"
        branches={['main', 'dev']}
      />,
    );
    const list = await screen.findByTestId('new-worktree-branch-list');
    const options = Array.from(list.querySelectorAll('option')).map((o) => o.getAttribute('value'));
    expect(options).toEqual(['main', 'dev']);
    const input = screen.getByTestId('new-worktree-branch');
    expect(input.getAttribute('list')).toBe(list.getAttribute('id'));
  });

  test('the create button is disabled until a branch name is entered', async () => {
    const bridge = createBridge({ ok: true, path: '/x', created: true });
    render(
      <NewWorktreeDialog
        open={true}
        onOpenChange={noop}
        bridge={bridge as never}
        currentBranch={null}
      />,
    );
    const button = (await screen.findByTestId('new-worktree-create')) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByTestId('new-worktree-branch'), { target: { value: 'x' } });
    await waitFor(() => expect(button.disabled).toBe(false));
  });
});
