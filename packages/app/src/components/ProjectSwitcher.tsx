import { Trans, useLingui } from '@lingui/react/macro';
import { ChevronsUpDown, FolderOpen, GitBranch, LayoutGrid, Plus, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group';
import { SidebarMenuButton } from '@/components/ui/sidebar';
import { useCurrentBranch } from '@/hooks/use-current-branch';
import { useWorktrees } from '@/hooks/use-worktrees';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { runWithToast as runWithToastBase } from '@/lib/error-state';
import { cn } from '@/lib/utils';
import { CreateProjectDialog } from './CreateProjectDialog';
import { NewWorktreeDialog } from './NewWorktreeDialog';
import { RecentProjectsMenu } from './RecentProjectsMenu';

export const runWithToast = (
  fn: () => Promise<void>,
  fallback: string,
  toastApi?: { error(msg: string): void },
): Promise<void> => runWithToastBase(fn, fallback, toastApi, 'ProjectSwitcher');

const SELECT_GUARD_MS = 350;

interface ProjectSwitcherProps {
  bridge: OkDesktopBridge;
}

export function ProjectSwitcher({ bridge }: ProjectSwitcherProps) {
  const { t } = useLingui();
  const [recents, setRecents] = useState<RecentProjectEntry[]>([]);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [createProjectOpen, setCreateProjectOpen] = useState(false);
  const [newWorktreeOpen, setNewWorktreeOpen] = useState(false);
  const branch = useCurrentBranch();
  const worktreeModel = useWorktrees();

  const isElectronHost = typeof window !== 'undefined' && window.okDesktop != null;
  const sawPointerDownRef = useRef(false);
  const withinOpenGuardRef = useRef(false);
  const openGuardTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleOpenChange = (next: boolean): void => {
    if (next) {
      withinOpenGuardRef.current = true;
      if (openGuardTimerRef.current !== null) clearTimeout(openGuardTimerRef.current);
      openGuardTimerRef.current = setTimeout(() => {
        withinOpenGuardRef.current = false;
      }, SELECT_GUARD_MS);
    }
    setOpen(next);
    if (!next) setSearch('');
  };

  const guardStaleSelect = (event: Event): boolean => {
    if (!isElectronHost || !withinOpenGuardRef.current) return false;
    event.preventDefault();
    return true;
  };

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void runWithToast(async () => {
      const result = await bridge.project.listRecent();
      if (!cancelled) setRecents(result);
    }, t`Failed to load recent projects.`);
    return () => {
      cancelled = true;
    };
  }, [open, bridge, t]);

  useEffect(() => {
    return bridge.onMenuAction((action) => {
      if (action === 'new-worktree') {
        setOpen(false);
        setNewWorktreeOpen(true);
      } else if (action === 'switch-worktree') {
        setOpen(true);
      }
    });
  }, [bridge]);

  const onOpenFolder = () => {
    setOpen(false);
    void runWithToast(async () => {
      const path = await bridge.dialog.openFolder();
      if (!path) return;
      await bridge.project.open({ path, target: 'new-window', entryPoint: 'pick-existing' });
    }, t`Failed to open folder.`);
  };

  const onSwitchProject = () => {
    setOpen(false);
    void runWithToast(() => bridge.navigator.open(), t`Failed to open Project Navigator.`);
  };

  const onCreateProject = () => {
    setOpen(false);
    setCreateProjectOpen(true);
  };

  const currentPath = bridge.config.projectPath;
  const query = search.trim().toLowerCase();

  return (
    <>
      {/*
        Non-modal (matches the Cloud/Sync Popover, which is non-modal and works
        normally). In the macOS desktop app, outside-click dismissal relies on a
        `pointerdown` Chromium does not deliver here (see the trigger onClick
        below), and a modal dropdown additionally disables pointer events on the
        rest of the chrome while open — together that left the menu impossible
        to dismiss by clicking out. Non-modal keeps the rest of the UI live and
        restores outside-click dismissal; the menu still closes on item-select,
        Escape, or re-clicking the trigger.
      */}
      <DropdownMenu open={open} onOpenChange={handleOpenChange} modal={false}>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            className={cn(
              'justify-between text-sidebar-foreground/70 hover:text-sidebar-foreground! data-open:hover:text-sidebar-foreground!',
              branch !== null && 'h-auto py-1.5',
            )}
            data-testid="project-switcher-trigger"
            aria-label={t`Open project menu`}
            title={bridge.config.projectPath}
            onPointerDown={
              isElectronHost
                ? () => {
                    sawPointerDownRef.current = true;
                  }
                : undefined
            }
            onClick={
              isElectronHost
                ? () => {
                    if (sawPointerDownRef.current) {
                      sawPointerDownRef.current = false;
                      return;
                    }
                    handleOpenChange(!open);
                  }
                : undefined
            }
          >
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="truncate">{bridge.config.projectName}</span>
              {branch !== null ? (
                <span
                  className="flex min-w-0 items-center gap-1 text-xs text-sidebar-foreground/50 group-hover/menu-button:text-sidebar-foreground"
                  data-testid="project-switcher-branch"
                >
                  <GitBranch aria-hidden="true" className="size-3! shrink-0" />
                  <span className="truncate">{branch}</span>
                </span>
              ) : null}
            </span>
            <ChevronsUpDown aria-hidden="true" className="opacity-60" />
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          side="top"
          className="min-w-[260px]"
          data-testid="project-switcher-menu"
        >
          {recents.length === 0 ? (
            <DropdownMenuLabel className="font-normal text-muted-foreground text-xs">
              <Trans>No recent projects.</Trans>
            </DropdownMenuLabel>
          ) : (
            <>
              {/* stopPropagation on keydown so Radix's menu typeahead doesn't
                swallow keystrokes meant for the filter field. */}
              <InputGroup className="mb-1 h-8 border-0 shadow-none has-[[data-slot=input-group-control]:focus-visible]:ring-0">
                <InputGroupInput
                  aria-label={t`Search projects and worktrees`}
                  placeholder={t`Search projects and worktrees...`}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  data-testid="project-switcher-search"
                />
                <InputGroupAddon>
                  <Search aria-hidden="true" />
                </InputGroupAddon>
              </InputGroup>
              <DropdownMenuSeparator />
              {/* Only the items list scrolls — the search field above and the
                New / Switch / Open actions below stay pinned. Radix resolves the
                DropdownMenuItem / DropdownMenuSub descendants for keyboard nav
                through this plain wrapper; submenu flyouts portal out, so the
                scroll clip doesn't cut them off. overscroll-contain stops scroll
                chaining to the page behind the dropdown at the list edges. */}
              <div className="max-h-64 overflow-x-hidden overflow-y-auto overscroll-contain subtle-scrollbar scroll-fade-mask">
                <RecentProjectsMenu
                  bridge={bridge}
                  recents={recents}
                  currentPath={currentPath}
                  query={query}
                  worktreeModel={worktreeModel}
                  closeMenu={() => setOpen(false)}
                  guardStaleSelect={guardStaleSelect}
                />
              </div>
            </>
          )}
          {branch !== null ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={(e) => {
                  if (guardStaleSelect(e)) return;
                  setOpen(false);
                  setNewWorktreeOpen(true);
                }}
                data-testid="project-switcher-new-worktree"
              >
                <GitBranch aria-hidden="true" className="text-muted-foreground" />
                <Trans>New worktree</Trans>
              </DropdownMenuItem>
            </>
          ) : null}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              if (guardStaleSelect(e)) return;
              onCreateProject();
            }}
            data-testid="project-switcher-new-project"
          >
            <Plus aria-hidden="true" className="text-muted-foreground" />
            <Trans>New project</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              if (guardStaleSelect(e)) return;
              onSwitchProject();
            }}
            data-testid="project-switcher-switch-project"
          >
            <LayoutGrid aria-hidden="true" className="text-muted-foreground" />
            <Trans>Switch project</Trans>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={(e) => {
              if (guardStaleSelect(e)) return;
              onOpenFolder();
            }}
            data-testid="project-switcher-open-folder"
          >
            <FolderOpen aria-hidden="true" className="text-muted-foreground" />
            <Trans>Open folder</Trans>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <CreateProjectDialog
        open={createProjectOpen}
        onOpenChange={setCreateProjectOpen}
        bridge={bridge}
      />
      <NewWorktreeDialog
        open={newWorktreeOpen}
        onOpenChange={setNewWorktreeOpen}
        bridge={bridge}
        currentBranch={branch}
        branches={worktreeModel?.entries
          .map((entry) => entry.branch)
          .filter((b): b is string => b !== null)}
      />
    </>
  );
}
