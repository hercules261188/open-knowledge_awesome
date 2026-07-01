import { beforeEach, describe, expect, mock, test } from 'bun:test';
import type { WorktreeSelectorModel } from '@inkeep/open-knowledge-core';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { RecentProjectsMenu } from './RecentProjectsMenu';

type ItemProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  [key: string]: unknown;
};

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenuItem: ({ children, disabled, onSelect, ...props }: ItemProps) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} {...props}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children, ...props }: ItemProps) => <div {...props}>{children}</div>,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children, ...props }: ItemProps) => (
    <button type="button" role="menuitem" {...props}>
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({ children, ...props }: ItemProps) => <div {...props}>{children}</div>,
}));

const refreshWorktrees = mock(() => {});
mock.module('@/lib/worktree-store', () => ({ refreshWorktrees }));
const toastError = mock((_msg: string) => {});
mock.module('sonner', () => ({ toast: { error: toastError, success: mock(() => {}) } }));

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

function model(entries: WorktreeSelectorModel['entries']): WorktreeSelectorModel {
  return { mainRoot: '/repo', currentBranch: 'main', entries };
}

function createBridge() {
  return {
    project: { open: mock(() => Promise.resolve()) },
    worktree: {
      create: mock(() =>
        Promise.resolve({
          ok: true as const,
          path: '/repo/.ok/worktrees/feature-x',
          created: true,
        }),
      ),
    },
  };
}

const noGuard = () => false;

function renderMenu(
  overrides: Partial<{
    bridge: ReturnType<typeof createBridge>;
    recents: RecentProjectEntry[];
    currentPath: string;
    query: string;
    worktreeModel: WorktreeSelectorModel | null;
    closeMenu: () => void;
  }> = {},
) {
  const bridge = overrides.bridge ?? createBridge();
  const closeMenu = overrides.closeMenu ?? mock(() => {});
  render(
    <RecentProjectsMenu
      bridge={bridge as never}
      recents={overrides.recents ?? []}
      currentPath={overrides.currentPath ?? '/other'}
      query={overrides.query ?? ''}
      worktreeModel={overrides.worktreeModel ?? null}
      closeMenu={closeMenu}
      guardStaleSelect={noGuard}
    />,
  );
  return { bridge, closeMenu };
}

describe('RecentProjectsMenu — grouped browse (no query)', () => {
  beforeEach(cleanup);

  test('nests a repo main + its linked worktrees under one submenu', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });

    expect(screen.getByTestId('project-switcher-group-/repo')).not.toBeNull();
    expect(screen.getByTestId('project-switcher-open-/repo')).not.toBeNull();

    fireEvent.click(screen.getByTestId('project-switcher-worktree-/repo/.ok/worktrees/dev'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/dev',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
  });

  test('opening the project row from the submenu uses the recents entry point', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
    });
    fireEvent.click(screen.getByTestId('project-switcher-open-/repo'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo',
        target: 'new-window',
        entryPoint: 'recents',
      });
    });
  });

  test('a non-git recent is a flat row that opens with the recents entry point', async () => {
    const { bridge } = renderMenu({ recents: [nonGit('/notes')] });
    expect(screen.queryByTestId('project-switcher-group-/notes')).toBeNull();
    fireEvent.click(screen.getByTestId('project-switcher-recent-/notes'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/notes',
        target: 'new-window',
        entryPoint: 'recents',
      });
    });
  });

  test('the current project row no-ops on select and just closes the menu', async () => {
    const { bridge, closeMenu } = renderMenu({
      recents: [nonGit('/notes')],
      currentPath: '/notes',
    });
    fireEvent.click(screen.getByTestId('project-switcher-recent-/notes'));
    expect(bridge.project.open).not.toHaveBeenCalled();
    expect(closeMenu).toHaveBeenCalled();
  });

  test('a repo present only via a worktree synthesizes the project row (no "Open project")', () => {
    renderMenu({
      recents: [worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev')],
    });
    expect(screen.getByTestId('project-switcher-group-/repo')).not.toBeNull();
    expect(screen.queryByTestId('project-switcher-open-/repo')).toBeNull();
    expect(screen.getByTestId('project-switcher-worktree-/repo/.ok/worktrees/dev')).not.toBeNull();
  });
});

describe('RecentProjectsMenu — search', () => {
  beforeEach(cleanup);

  test('matches an opened worktree by branch name and opens it as a worktree', async () => {
    const { bridge } = renderMenu({
      recents: [
        main('/repo', '/repo/.git'),
        worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev'),
      ],
      query: 'dev',
    });
    fireEvent.click(screen.getByTestId('project-switcher-worktree-/repo/.ok/worktrees/dev'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/dev',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
  });

  test('matches an un-opened branch from the cached model and creates its worktree on demand', async () => {
    const { bridge } = renderMenu({
      query: 'feature',
      worktreeModel: model([
        { branch: 'feature-x', worktreePath: null, isCurrent: false, isMain: false, locked: false },
      ]),
    });
    fireEvent.click(screen.getByTestId('project-switcher-branch-feature-x'));
    await waitFor(() => {
      expect(bridge.worktree.create).toHaveBeenCalledWith({
        branch: 'feature-x',
        createBranch: false,
      });
    });
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/repo/.ok/worktrees/feature-x',
        target: 'new-window',
        entryPoint: 'worktree',
      });
    });
    expect(refreshWorktrees).toHaveBeenCalled();
  });

  test('does not double-list a branch already shown as an opened worktree', () => {
    renderMenu({
      recents: [worktree('/repo/.ok/worktrees/dev', '/repo/.git', '/repo', 'dev')],
      query: 'dev',
      worktreeModel: model([
        {
          branch: 'dev',
          worktreePath: '/repo/.ok/worktrees/dev',
          isCurrent: false,
          isMain: false,
          locked: false,
        },
      ]),
    });
    expect(screen.getByTestId('project-switcher-worktree-/repo/.ok/worktrees/dev')).not.toBeNull();
    expect(screen.queryByTestId('project-switcher-branch-dev')).toBeNull();
  });

  test('announces when nothing matches', () => {
    renderMenu({ recents: [main('/repo', '/repo/.git')], query: 'zzz-nothing' });
    expect(screen.getByRole('status').textContent).toBe('No matching projects or worktrees.');
  });

  test('a failed create-on-demand toasts and does not open a window', async () => {
    toastError.mockClear();
    const bridge = createBridge();
    bridge.worktree.create = mock(() =>
      Promise.resolve({ ok: false as const, reason: 'branch-exists' as const }),
    );
    renderMenu({
      bridge,
      query: 'feature',
      worktreeModel: model([
        { branch: 'feature-x', worktreePath: null, isCurrent: false, isMain: false, locked: false },
      ]),
    });
    fireEvent.click(screen.getByTestId('project-switcher-branch-feature-x'));
    await waitFor(() => expect(bridge.worktree.create).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(toastError).toHaveBeenCalled());
    expect(bridge.project.open).not.toHaveBeenCalled();
  });
});
