import { beforeEach, describe, expect, mock, test } from 'bun:test';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { ProjectSwitcher } from './ProjectSwitcher';

type MenuProps = {
  children?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};
type ItemProps = {
  children?: ReactNode;
  disabled?: boolean;
  onSelect?: () => void;
  [key: string]: unknown;
};

let lastDropdownOpenChange: ((open: boolean) => void) | null = null;
let keydownBubbleCount = 0;
let createDialogProps: Array<{ open: boolean; bridge: unknown }> = [];

mock.module('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children, onOpenChange }: MenuProps) => {
    lastDropdownOpenChange = onOpenChange ?? null;
    return <div>{children}</div>;
  },
  DropdownMenuContent: ({ children, ...props }: ItemProps) => (
    <div role="menu" {...props}>
      {children}
    </div>
  ),
  DropdownMenuItem: ({ children, disabled, onSelect, ...props }: ItemProps) => (
    <button type="button" role="menuitem" disabled={disabled} onClick={onSelect} {...props}>
      {children}
    </button>
  ),
  DropdownMenuLabel: ({ children, ...props }: ItemProps) => <div {...props}>{children}</div>,
  DropdownMenuSeparator: () => <hr />,
  DropdownMenuTrigger: ({ children }: { children?: ReactNode }) => <>{children}</>,
  DropdownMenuSub: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children, ...props }: ItemProps) => (
    <button type="button" role="menuitem" {...props}>
      {children}
    </button>
  ),
  DropdownMenuSubContent: ({ children, ...props }: ItemProps) => <div {...props}>{children}</div>,
}));

mock.module('@/components/ui/input-group', () => ({
  InputGroup: ({ children, ...props }: ItemProps) => (
    <fieldset
      {...props}
      onKeyDown={() => {
        keydownBubbleCount += 1;
      }}
    >
      {children}
    </fieldset>
  ),
  InputGroupAddon: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  InputGroupInput: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

mock.module('@/components/ui/sidebar', () => ({
  SidebarMenuButton: ({ children, ...props }: ItemProps) => (
    <button type="button" {...props}>
      {children}
    </button>
  ),
}));

mock.module('./CreateProjectDialog', () => ({
  CreateProjectDialog: (props: { open: boolean; bridge: unknown }) => {
    createDialogProps.push(props);
    return <div data-testid="create-project-dialog" data-open={String(props.open)} />;
  },
}));

let newWorktreeProps: Array<{ open: boolean }> = [];
mock.module('./NewWorktreeDialog', () => ({
  NewWorktreeDialog: (props: { open: boolean }) => {
    newWorktreeProps.push(props);
    return <div data-testid="new-worktree-dialog" data-open={String(props.open)} />;
  },
}));

mock.module('@/hooks/use-current-branch', () => ({
  useCurrentBranch: () => 'main',
}));
mock.module('@/hooks/use-worktrees', () => ({
  useWorktrees: () => null,
}));

function recent(name: string, path = `/projects/${name.toLowerCase()}`) {
  return { name, path: path.replaceAll(' ', '-') };
}

function createBridge() {
  return {
    config: {
      projectName: 'Current Project',
      projectPath: '/projects/current',
    },
    project: {
      listRecent: mock(() =>
        Promise.resolve([
          recent('Current', '/projects/current'),
          ...Array.from({ length: 10 }, (_, index) => recent(`Project ${index + 1}`)),
          recent('Omega', '/archive/omega-project'),
        ]),
      ),
      open: mock(() => Promise.resolve()),
    },
    dialog: {
      openFolder: mock(() => Promise.resolve('/chosen/folder')),
    },
    navigator: {
      open: mock(() => Promise.resolve()),
    },
    worktree: {
      list: mock(() => Promise.resolve({ ok: false as const, reason: 'no-git' as const })),
      create: mock(() => Promise.resolve({ ok: false as const, reason: 'no-git' as const })),
    },
    onMenuAction: mock((cb: (action: string) => void) => {
      menuActionCb = cb;
      return () => {
        menuActionCb = null;
      };
    }),
  };
}

let menuActionCb: ((action: string) => void) | null = null;

async function openMenu() {
  fireEvent.click(screen.getByTestId('project-switcher-trigger'));
  act(() => {
    lastDropdownOpenChange?.(true);
  });
  await waitFor(() => {
    expect(screen.getByTestId('project-switcher-search')).not.toBeNull();
  });
}

describe('ProjectSwitcher dropdown behavior', () => {
  beforeEach(() => {
    cleanup();
    lastDropdownOpenChange = null;
    keydownBubbleCount = 0;
    createDialogProps = [];
    newWorktreeProps = [];
    menuActionCb = null;
    (window as unknown as { okDesktop?: unknown }).okDesktop = undefined;
  });

  test('renders footer actions in order and routes each action through the expected bridge entry point', async () => {
    const bridge = createBridge();
    render(<ProjectSwitcher bridge={bridge as never} />);

    expect(screen.getByTestId('project-switcher-trigger').textContent).toContain('Current Project');

    await openMenu();

    const menuText = screen.getByTestId('project-switcher-menu').textContent ?? '';
    const newProjectIndex = menuText.indexOf('New project');
    const switchProjectIndex = menuText.indexOf('Switch project');
    const openFolderIndex = menuText.indexOf('Open folder');
    expect(newProjectIndex).toBeGreaterThan(-1);
    expect(switchProjectIndex).toBeGreaterThan(newProjectIndex);
    expect(openFolderIndex).toBeGreaterThan(switchProjectIndex);

    for (const testId of [
      'project-switcher-new-project',
      'project-switcher-switch-project',
      'project-switcher-open-folder',
    ]) {
      expect(screen.getByTestId(testId).querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    }

    fireEvent.click(screen.getByTestId('project-switcher-switch-project'));
    await waitFor(() => expect(bridge.navigator.open).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByTestId('project-switcher-open-folder'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/chosen/folder',
        target: 'new-window',
        entryPoint: 'pick-existing',
      });
    });

    fireEvent.click(screen.getByTestId('project-switcher-recent-/projects/project-1'));
    await waitFor(() => {
      expect(bridge.project.open).toHaveBeenCalledWith({
        path: '/projects/project-1',
        target: 'new-window',
        entryPoint: 'recents',
      });
    });

    fireEvent.click(screen.getByTestId('project-switcher-new-project'));
    await waitFor(() => {
      expect(screen.getByTestId('create-project-dialog').getAttribute('data-open')).toBe('true');
    });
    expect(createDialogProps.at(-1)?.bridge).toBe(bridge);
  });

  test('search matches across recents, announces empty results, stops typeahead bubbling, and clears on close', async () => {
    const bridge = createBridge();
    render(<ProjectSwitcher bridge={bridge as never} />);

    await openMenu();

    const search = screen.getByTestId('project-switcher-search') as HTMLInputElement;

    fireEvent.keyDown(search, { key: 'O' });
    expect(keydownBubbleCount).toBe(0);

    fireEvent.change(search, { target: { value: 'omega' } });

    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-recent-/archive/omega-project')).not.toBeNull();
    });
    expect(screen.queryByTestId('project-switcher-recent-/projects/project-1')).toBeNull();

    fireEvent.change(search, { target: { value: 'does-not-exist' } });

    expect((await screen.findByRole('status')).textContent).toBe(
      'No matching projects or worktrees.',
    );

    act(() => {
      lastDropdownOpenChange?.(false);
      lastDropdownOpenChange?.(true);
    });

    await waitFor(() => {
      expect((screen.getByTestId('project-switcher-search') as HTMLInputElement).value).toBe('');
    });
  });

  test('the top-level "New worktree…" item opens the New Worktree dialog', async () => {
    const bridge = createBridge();
    render(<ProjectSwitcher bridge={bridge as never} />);
    await openMenu();

    fireEvent.click(screen.getByTestId('project-switcher-new-worktree'));
    await waitFor(() =>
      expect(screen.getByTestId('new-worktree-dialog').getAttribute('data-open')).toBe('true'),
    );
  });

  test('File menu "new-worktree" action opens the New Worktree dialog; "switch-worktree" opens the dropdown', async () => {
    const bridge = createBridge();
    render(<ProjectSwitcher bridge={bridge as never} />);
    expect(menuActionCb).not.toBeNull();

    act(() => menuActionCb?.('new-worktree'));
    await waitFor(() =>
      expect(screen.getByTestId('new-worktree-dialog').getAttribute('data-open')).toBe('true'),
    );

    act(() => menuActionCb?.('switch-worktree'));
    await waitFor(() => {
      expect(screen.getByTestId('project-switcher-search')).not.toBeNull();
    });
  });

  test('on the Electron host, a row selection within the open-click guard window is swallowed, then works after it', async () => {
    (window as unknown as { okDesktop?: unknown }).okDesktop = {};
    const bridge = createBridge();
    render(<ProjectSwitcher bridge={bridge as never} />);
    await openMenu();

    fireEvent.click(screen.getByTestId('project-switcher-recent-/projects/project-1'));
    expect(bridge.project.open).not.toHaveBeenCalled();

    await new Promise((resolve) => setTimeout(resolve, 450));
    fireEvent.click(screen.getByTestId('project-switcher-recent-/projects/project-1'));
    await waitFor(() => expect(bridge.project.open).toHaveBeenCalledTimes(1));
  });
});
