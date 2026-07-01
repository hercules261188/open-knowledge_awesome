import type { WorktreeSelectorEntry, WorktreeSelectorModel } from '@inkeep/open-knowledge-core';
import { Trans, useLingui } from '@lingui/react/macro';
import { Check, FolderGit2, GitBranch } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu';
import type { OkDesktopBridge, RecentProjectEntry } from '@/lib/desktop-bridge-types';
import { cn } from '@/lib/utils';
import { refreshWorktrees } from '@/lib/worktree-store';
import { groupRecentsByRepo, type RecentRepoGroup } from './project-switcher-recents';

type TFn = ReturnType<typeof useLingui>['t'];

interface RecentProjectsMenuProps {
  bridge: OkDesktopBridge;
  recents: readonly RecentProjectEntry[];
  currentPath: string;
  query: string;
  worktreeModel: WorktreeSelectorModel | null;
  closeMenu: () => void;
  guardStaleSelect: (event: Event) => boolean;
}

export function RecentProjectsMenu({
  bridge,
  recents,
  currentPath,
  query,
  worktreeModel,
  closeMenu,
  guardStaleSelect,
}: RecentProjectsMenuProps) {
  const { t } = useLingui();

  function openPath(path: string, entryPoint: 'recents' | 'worktree'): void {
    closeMenu();
    void bridge.project.open({ path, target: 'new-window', entryPoint }).catch((err) => {
      console.warn('[RecentProjectsMenu] project.open failed:', err);
      toast.error(t`Failed to open.`);
    });
  }

  async function createAndOpenBranch(branch: string): Promise<void> {
    try {
      const result = await bridge.worktree.create({ branch, createBranch: false });
      if (!result.ok) {
        toast.error(t`Couldn't open a worktree for that branch.`);
        return;
      }
      refreshWorktrees();
      await bridge.project.open({
        path: result.path,
        target: 'new-window',
        entryPoint: 'worktree',
      });
    } catch (err) {
      console.warn('[RecentProjectsMenu] create/open branch failed:', err);
      toast.error(t`Failed to open worktree.`);
    }
  }

  function onPickEntry(entry: RecentProjectEntry): void {
    if (entry.path === currentPath) {
      closeMenu();
      return;
    }
    openPath(entry.path, entry.isLinkedWorktree ? 'worktree' : 'recents');
  }

  if (query !== '') {
    return (
      <SearchResults
        recents={recents}
        currentPath={currentPath}
        query={query}
        worktreeModel={worktreeModel}
        onPickEntry={onPickEntry}
        onPickBranch={(branch) => {
          closeMenu();
          void createAndOpenBranch(branch);
        }}
        guardStaleSelect={guardStaleSelect}
        t={t}
      />
    );
  }

  const groups = groupRecentsByRepo(recents);
  return (
    <>
      {groups.map((group) => (
        <GroupRow
          key={group.project.path}
          group={group}
          currentPath={currentPath}
          onPickEntry={onPickEntry}
          onPickProject={() => {
            if (group.project.path === currentPath) {
              closeMenu();
              return;
            }
            openPath(group.project.path, 'recents');
          }}
          guardStaleSelect={guardStaleSelect}
          t={t}
        />
      ))}
    </>
  );
}

function GroupRow({
  group,
  currentPath,
  onPickEntry,
  onPickProject,
  guardStaleSelect,
  t,
}: {
  group: RecentRepoGroup;
  currentPath: string;
  onPickEntry: (entry: RecentProjectEntry) => void;
  onPickProject: () => void;
  guardStaleSelect: (event: Event) => boolean;
  t: TFn;
}) {
  const projectIsCurrent = group.project.path === currentPath;

  if (group.worktrees.length === 0) {
    return (
      <DropdownMenuItem
        onSelect={(e) => {
          if (guardStaleSelect(e)) return;
          onPickProject();
        }}
        className="flex w-full min-w-0 flex-col items-start gap-0.5"
        data-testid={`project-switcher-recent-${group.project.path}`}
        data-current={projectIsCurrent ? 'true' : undefined}
      >
        <ProjectLabel
          name={group.project.name}
          path={group.project.path}
          current={projectIsCurrent}
        />
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        className="flex min-w-0"
        data-testid={`project-switcher-group-${group.project.path}`}
      >
        <FolderGit2 aria-hidden="true" className="text-muted-foreground" />
        <span className="min-w-0 flex-1 truncate">{group.project.name}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="min-w-[220px]">
        {group.projectSynthesized ? null : (
          <DropdownMenuItem
            onSelect={(e) => {
              if (guardStaleSelect(e)) return;
              onPickProject();
            }}
            className="flex items-center gap-2"
            data-testid={`project-switcher-open-${group.project.path}`}
            data-current={projectIsCurrent ? 'true' : undefined}
          >
            <FolderGit2 aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
            {/* <Trans> (not t`Open ${x}`): the React Compiler can't lower a
              tagged template with interpolations, and it only surfaces in the
              vite build's Babel pass, not tsc or bun tests. */}
            <span className="min-w-0 flex-1 truncate">
              <Trans>Open {group.project.name}</Trans>
            </span>
            {projectIsCurrent ? <CurrentCheck t={t} /> : null}
          </DropdownMenuItem>
        )}
        {group.worktrees.map((wt) => {
          const wtCurrent = wt.path === currentPath;
          return (
            <DropdownMenuItem
              key={wt.path}
              onSelect={(e) => {
                if (guardStaleSelect(e)) return;
                onPickEntry(wt);
              }}
              className="flex items-center gap-2"
              data-testid={`project-switcher-worktree-${wt.path}`}
              data-current={wtCurrent ? 'true' : undefined}
            >
              <GitBranch aria-hidden="true" className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{wt.branch ?? t`(detached)`}</span>
              {wtCurrent ? <CurrentCheck t={t} /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function SearchResults({
  recents,
  currentPath,
  query,
  worktreeModel,
  onPickEntry,
  onPickBranch,
  guardStaleSelect,
  t,
}: {
  recents: readonly RecentProjectEntry[];
  currentPath: string;
  query: string;
  worktreeModel: WorktreeSelectorModel | null;
  onPickEntry: (entry: RecentProjectEntry) => void;
  onPickBranch: (branch: string) => void;
  guardStaleSelect: (event: Event) => boolean;
  t: TFn;
}) {
  const matches = (text: string): boolean => text.toLowerCase().includes(query);

  const projectMatches = recents.filter(
    (r) => !r.isLinkedWorktree && (matches(r.name) || matches(r.path)),
  );
  const openedWorktreeMatches = recents.filter(
    (r) => r.isLinkedWorktree === true && (matches(r.branch ?? '') || matches(r.path)),
  );
  const openedWorktreePaths = new Set(openedWorktreeMatches.map((w) => w.path));
  const branchMatches: WorktreeSelectorEntry[] = (worktreeModel?.entries ?? []).filter(
    (e) =>
      e.branch !== null &&
      matches(e.branch) &&
      (e.worktreePath === null || !openedWorktreePaths.has(e.worktreePath)) &&
      e.worktreePath !== currentPath,
  );

  if (
    projectMatches.length === 0 &&
    openedWorktreeMatches.length === 0 &&
    branchMatches.length === 0
  ) {
    return (
      <DropdownMenuLabel
        className="font-normal text-muted-foreground text-xs"
        role="status"
        aria-live="polite"
      >
        {t`No matching projects or worktrees.`}
      </DropdownMenuLabel>
    );
  }

  return (
    <>
      {projectMatches.map((r) => (
        <DropdownMenuItem
          key={r.path}
          onSelect={(e) => {
            if (guardStaleSelect(e)) return;
            onPickEntry(r);
          }}
          className="flex w-full min-w-0 flex-col items-start gap-0.5"
          data-testid={`project-switcher-recent-${r.path}`}
        >
          <ProjectLabel name={r.name} path={r.path} current={r.path === currentPath} />
        </DropdownMenuItem>
      ))}
      {openedWorktreeMatches.map((r) => (
        <DropdownMenuItem
          key={r.path}
          onSelect={(e) => {
            if (guardStaleSelect(e)) return;
            onPickEntry(r);
          }}
          className="flex items-center gap-2"
          data-testid={`project-switcher-worktree-${r.path}`}
          data-current={r.path === currentPath ? 'true' : undefined}
        >
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">{r.branch ?? r.name}</span>
        </DropdownMenuItem>
      ))}
      {branchMatches.map((e) => (
        <DropdownMenuItem
          key={`branch:${e.branch}`}
          onSelect={(ev) => {
            if (guardStaleSelect(ev)) return;
            if (e.branch !== null) onPickBranch(e.branch);
          }}
          className="flex items-center gap-2"
          data-testid={`project-switcher-branch-${e.branch}`}
        >
          <GitBranch aria-hidden="true" className="size-3.5 shrink-0 opacity-40" />
          <span className="min-w-0 flex-1 truncate">{e.branch}</span>
          <span className="shrink-0 text-muted-foreground text-xs">{t`worktree`}</span>
        </DropdownMenuItem>
      ))}
    </>
  );
}

function ProjectLabel({ name, path, current }: { name: string; path: string; current: boolean }) {
  return (
    <>
      <span className={cn('flex w-full items-center gap-1.5', current && 'font-medium')}>
        <span className="truncate font-medium text-sm" title={name}>
          {name}
        </span>
        {current ? (
          <Check aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </span>
      <span className="w-full truncate text-muted-foreground text-xs" title={path}>
        {path}
      </span>
    </>
  );
}

function CurrentCheck({ t }: { t: TFn }) {
  return <Check aria-label={t`Current`} className="size-3.5 shrink-0 text-muted-foreground" />;
}
