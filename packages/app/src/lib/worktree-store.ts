import type { WorktreeSelectorModel } from '@inkeep/open-knowledge-core';

export interface WorktreeStore {
  getSnapshot(): WorktreeSelectorModel | null;
  subscribe(listener: () => void): () => void;
  refresh(): void;
}

interface WorktreeStoreDeps {
  fetchModel: () => Promise<WorktreeSelectorModel | null>;
}

export function createWorktreeStore(deps: WorktreeStoreDeps): WorktreeStore {
  let model: WorktreeSelectorModel | null = null;
  let bootstrapped = false;
  let inFlight = false;
  let reloadQueued = false;
  const listeners = new Set<() => void>();

  function emit(): void {
    for (const listener of listeners) listener();
  }

  async function load(): Promise<void> {
    if (inFlight) {
      reloadQueued = true;
      return;
    }
    inFlight = true;
    try {
      const next = await deps.fetchModel();
      if (next !== null && next !== model) {
        model = next;
        emit();
      }
    } catch {
    } finally {
      inFlight = false;
      if (reloadQueued) {
        reloadQueued = false;
        void load();
      }
    }
  }

  return {
    getSnapshot: () => model,
    subscribe(listener) {
      listeners.add(listener);
      if (!bootstrapped) {
        bootstrapped = true;
        void load();
      }
      return () => {
        listeners.delete(listener);
      };
    },
    refresh() {
      void load();
    },
  };
}

async function fetchWorktreeModel(): Promise<WorktreeSelectorModel | null> {
  const bridge = typeof window !== 'undefined' ? window.okDesktop : undefined;
  if (!bridge) return null;
  const result = await bridge.worktree.list();
  return result.ok ? result.model : null;
}

const productionStore: WorktreeStore =
  typeof window === 'undefined'
    ? // SSR / non-browser: nothing to fetch. Consumers render their empty state.
      { getSnapshot: () => null, subscribe: () => () => {}, refresh: () => {} }
    : createWorktreeStore({ fetchModel: fetchWorktreeModel });

export const subscribeToWorktrees = productionStore.subscribe;
export const getWorktreesSnapshot = productionStore.getSnapshot;
export const refreshWorktrees = productionStore.refresh;
