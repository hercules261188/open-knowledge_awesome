import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';
import { Trans, useLingui } from '@lingui/react/macro';
import { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { OkDesktopBridge } from '@/lib/desktop-bridge-types';
import { refreshWorktrees } from '@/lib/worktree-store';

interface NewWorktreeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bridge: OkDesktopBridge;
  currentBranch: string | null;
  branches?: readonly string[];
}

function createErrorCopy(reason: string): MessageDescriptor {
  switch (reason) {
    case 'branch-exists':
      return msg`A branch with that name already exists. Open its worktree from the switcher instead.`;
    case 'already-checked-out':
      return msg`That branch is already open in another worktree.`;
    case 'path-exists':
      return msg`A worktree folder for that branch already exists.`;
    case 'invalid-branch':
      return msg`Enter a valid branch name (no spaces, no leading dot, no "..").`;
    case 'no-git':
      return msg`This project isn't a git repository, so worktrees aren't available.`;
    default:
      return msg`Couldn't create the worktree. Try a different name.`;
  }
}

export function NewWorktreeDialog({
  open,
  onOpenChange,
  bridge,
  currentBranch,
  branches = [],
}: NewWorktreeDialogProps) {
  const { t } = useLingui();
  const formId = useId();
  const nameInputId = useId();
  const captionId = useId();
  const errorId = useId();
  const branchListId = useId();
  const [branch, setBranch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageDescriptor | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setBranch('');
    setBusy(false);
    setError(null);
    const raf = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(raf);
  }, [open]);

  const trimmed = branch.trim();
  const canSubmit = !busy && trimmed.length > 0;
  const isCheckout = trimmed.length > 0 && branches.includes(trimmed);

  async function onSubmit(e: React.SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const result = await bridge.worktree.create({
        branch: trimmed,
        createBranch: !isCheckout,
        baseBranch: isCheckout ? undefined : (currentBranch ?? undefined),
      });
      if (!result.ok) {
        setError(createErrorCopy(result.reason));
        setBusy(false);
        return;
      }
      refreshWorktrees();
      onOpenChange(false);
      await bridge.project.open({
        path: result.path,
        target: 'new-window',
        entryPoint: 'worktree',
      });
    } catch (err) {
      console.warn('[NewWorktreeDialog] worktree create/open failed:', err);
      toast.error(t`Couldn't open the worktree. Try again.`);
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-md" data-testid="new-worktree-dialog">
        <DialogHeader>
          <DialogTitle>
            <Trans>New worktree</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>Create a new branch, or check out an existing one, in its own window.</Trans>
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <form id={formId} onSubmit={onSubmit} className="flex flex-col gap-2">
            <Label htmlFor={nameInputId}>
              <Trans>Branch name</Trans>
            </Label>
            <Input
              id={nameInputId}
              ref={inputRef}
              value={branch}
              placeholder={t`my-feature`}
              list={branches.length > 0 ? branchListId : undefined}
              onChange={(e) => {
                setBranch(e.target.value);
                if (error !== null) setError(null);
              }}
              disabled={busy}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              aria-invalid={error !== null}
              aria-describedby={error !== null ? `${captionId} ${errorId}` : captionId}
              data-testid="new-worktree-branch"
            />
            {branches.length > 0 ? (
              <datalist id={branchListId} data-testid="new-worktree-branch-list">
                {branches.map((b) => (
                  <option key={b} value={b} />
                ))}
              </datalist>
            ) : null}
            <p
              id={captionId}
              className="text-1sm text-muted-foreground"
              data-testid="new-worktree-base"
            >
              {isCheckout ? (
                <Trans>
                  Checks out <code className="font-mono break-all">{trimmed}</code> into its own
                  window, under <code className="font-mono">.ok/worktrees/</code>.
                </Trans>
              ) : currentBranch !== null ? (
                <Trans>
                  New branch based on <code className="font-mono break-all">{currentBranch}</code>.
                  The worktree lives inside the project, under{' '}
                  <code className="font-mono">.ok/worktrees/</code>.
                </Trans>
              ) : (
                <Trans>
                  New branch based on the current commit. The worktree lives inside the project,
                  under <code className="font-mono">.ok/worktrees/</code>.
                </Trans>
              )}
            </p>
            {error !== null ? (
              <p
                id={errorId}
                role="alert"
                className="text-1sm text-destructive"
                data-testid="new-worktree-error"
              >
                {t(error)}
              </p>
            ) : null}
          </form>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            data-testid="new-worktree-cancel"
          >
            <Trans>Cancel</Trans>
          </Button>
          <Button
            type="submit"
            form={formId}
            disabled={!canSubmit}
            data-testid="new-worktree-create"
          >
            {busy ? (
              <Trans>Working</Trans>
            ) : isCheckout ? (
              <Trans>Check out worktree</Trans>
            ) : (
              <Trans>Create worktree</Trans>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
