import { Trans } from '@lingui/react/macro';
import { useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { useConfigContext } from '@/lib/config-provider';

interface InheritedAutoSync {
  enabled?: boolean | null;
  inheritedNoticePending?: unknown;
  inheritedFrom?: unknown;
}

export function useWorktreeAutoSyncNotice(): void {
  const { projectLocalConfig, projectLocalSynced, projectLocalBinding } = useConfigContext();
  const shownRef = useRef(false);

  useEffect(() => {
    if (!projectLocalSynced || shownRef.current || projectLocalBinding === null) return;
    const autoSync = projectLocalConfig?.autoSync as InheritedAutoSync | undefined;
    if (autoSync?.inheritedNoticePending !== true) return;

    shownRef.current = true;
    const project = typeof autoSync.inheritedFrom === 'string' ? autoSync.inheritedFrom : '';
    toast(
      autoSync.enabled === true ? (
        <Trans>
          Auto-sync is on for this worktree, inherited from {project}. Change it in Settings → Sync.
        </Trans>
      ) : (
        <Trans>
          Auto-sync is off for this worktree, inherited from {project}. Change it in Settings →
          Sync.
        </Trans>
      ),
    );
    projectLocalBinding.patch({ autoSync: { inheritedNoticePending: null } });
  }, [projectLocalSynced, projectLocalConfig, projectLocalBinding]);
}
