import { WriteWarningSchema } from '@inkeep/open-knowledge-core';
import type { z } from 'zod';

export type ContentDivergence = z.infer<typeof WriteWarningSchema>;

export function parseContentDivergence(warning: unknown): ContentDivergence | undefined {
  const parsed = WriteWarningSchema.safeParse(warning);
  return parsed.success ? parsed.data : undefined;
}

export function formatContentDivergenceLine(d: ContentDivergence): string {
  return d.kind === 'content-divergence'
    ? `⚠ Content divergence: ${d.actualBytes} actual bytes vs ${d.intendedBytes} intended (byteDelta=${d.byteDelta}). ${d.hint ?? 'currentState carries the converged content (re-read only if it is truncated).'}`
    : `⚠ ${d.hint ?? 'An out-of-band edit was reconciled into this document before your edit landed on top — re-read for the combined result.'}`;
}

export function formatContentDivergenceBrief(d: ContentDivergence): string {
  return d.kind === 'content-divergence'
    ? `⚠ Content divergence: ${d.actualBytes} actual vs ${d.intendedBytes} intended (byteDelta=${d.byteDelta}).`
    : '⚠ Out-of-band disk edit reconciled before this write — re-read for the combined result.';
}
