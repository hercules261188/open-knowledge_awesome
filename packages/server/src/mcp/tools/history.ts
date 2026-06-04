import { z } from 'zod';
import { resolvePreviewUrlForTool } from './preview-url.ts';
import type { ConfigOrResolver, ServerInstance, ServerUrlOrResolver } from './shared.ts';
import {
  HOCUSPOCUS_NOT_RUNNING_ERROR,
  httpGet,
  looseObjectArray,
  normalizeDocName,
  outputSchemaWithText,
  previewUrlOutputField,
  previewUrlSourceField,
  ROUTED_CWD_DESCRIPTION,
  resolveProjectServerContext,
  textPlusStructured,
  textResult,
} from './shared.ts';

const HISTORY_KINDS = ['checkpoint', 'wip', 'upstream'] as const;

const HistoryEntryOutputSchema = z.object({
  version: z
    .string()
    .describe(
      '40-char commit SHA for this entry — pass to `restore_version({ document, version })`.',
    ),
  timestamp: z.string().describe('ISO timestamp of the entry.'),
  author: z.string().describe('Author display name.'),
  authorEmail: z.string().describe('Author email.'),
  kind: z.enum(HISTORY_KINDS).describe('Entry kind: checkpoint / wip / upstream.'),
  message: z.string().describe('Commit subject (the checkpoint summary, when one was set).'),
  contributors: looseObjectArray.describe(
    'Per-contributor records parsed from the commit (writer id, name, docs, summaries).',
  ),
  checkpoint: z
    .unknown()
    .nullable()
    .describe('Checkpoint metadata when this entry is a checkpoint, else null.'),
});

export const DESCRIPTION = [
  '[Requires: Hocuspocus server] List version history for a document.',
  'Returns timeline entries from the shadow repo, sorted by timestamp descending.',
  'Each entry carries a `version` (40-char commit SHA) you pass straight to `restore_version({ document, version })` — same field name on both sides.',
  '',
  '**Parameters:**',
  '- `document` — Document name to query history for, typically without extension. A trailing `.md` or `.mdx` is stripped automatically.',
  '- `branch` (optional) — Branch name (default: current branch)',
  '- `limit` (optional) — Maximum entries to return (default 50, max 200)',
  '- `offset` (optional) — Number of entries to skip for pagination (default 0)',
  '- `kind` (optional) — Filter by entry type: "checkpoint", "upstream", or "wip"',
  '- `author` (optional) — Filter to entries by this author name or email',
  '- `excludeAuthor` (optional) — Exclude entries by this author name or email',
].join('\n');

export interface GetHistoryDeps {
  serverUrl: ServerUrlOrResolver;
  config: ConfigOrResolver;
  resolveCwd: (explicit?: string) => Promise<string>;
}

export function register(server: ServerInstance, deps: GetHistoryDeps): void {
  server.registerTool(
    'history',
    {
      description: DESCRIPTION,
      inputSchema: {
        document: z.string().describe('Document name to query history for'),
        branch: z.string().optional().describe('Branch name (default: current branch)'),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe('Maximum entries to return (default 50, max 200)'),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Number of entries to skip for pagination (default 0)'),
        kind: z
          .enum(['checkpoint', 'upstream', 'wip'])
          .optional()
          .describe('Filter by entry type (`checkpoint` / `upstream` / `wip`).'),
        author: z.string().optional().describe('Filter to entries by this author name or email'),
        excludeAuthor: z
          .string()
          .optional()
          .describe('Exclude entries by this author name or email'),
        cwd: z.string().optional().describe(ROUTED_CWD_DESCRIPTION),
      },
      outputSchema: outputSchemaWithText({
        entries: z
          .array(HistoryEntryOutputSchema)
          .describe(
            'Timeline entries, newest first. Each carries a `version` for `restore_version`.',
          ),
        total: z.number().int().optional().describe('Total entries available (pre-pagination).'),
        truncated: z
          .boolean()
          .optional()
          .describe(
            'Whether more entries exist beyond this returned page (the result was limit-capped).',
          ),
        previewUrl: previewUrlOutputField,
        previewUrlSource: previewUrlSourceField,
      }),
    },
    async (args: {
      document: string;
      branch?: string;
      limit?: number;
      offset?: number;
      kind?: string;
      author?: string;
      excludeAuthor?: string;
      cwd?: string;
    }) => {
      const context = await resolveProjectServerContext(
        deps.resolveCwd,
        deps.config,
        deps.serverUrl,
        args.cwd,
      );
      if (!context.ok) return textResult(`Error: ${context.error}`, true);
      const { cwd, url } = context;
      if (!url) return textResult(HOCUSPOCUS_NOT_RUNNING_ERROR, true);

      const normalized = normalizeDocName(args.document);
      if (!normalized.ok) return textResult(normalized.error, true);

      const params = new URLSearchParams();
      params.set('docName', normalized.docName);
      if (args.branch) params.set('branch', args.branch);
      if (args.limit != null) params.set('limit', String(args.limit));
      if (args.offset != null) params.set('offset', String(args.offset));
      if (args.kind) params.set('type', args.kind);
      if (args.author) params.set('author', args.author);
      if (args.excludeAuthor) params.set('excludeAuthor', args.excludeAuthor);

      const result = await httpGet(url, `/api/history?${params.toString()}`);
      if (!result.ok) return textResult(`Error: ${result.error}`, true);

      const { ok: _ok, ...data } = result;
      const rawEntries = Array.isArray((data as { entries?: unknown }).entries)
        ? (data as { entries: unknown[] }).entries
        : [];
      const entries = rawEntries.map((raw) => {
        const e = raw as Record<string, unknown>;
        return {
          version: e.sha,
          timestamp: e.timestamp,
          author: e.author,
          authorEmail: e.authorEmail,
          kind: e.type,
          message: e.message,
          contributors: e.contributors,
          checkpoint: e.checkpoint ?? null,
        };
      });
      const total = (data as { total?: unknown }).total;
      const hasMore = (data as { hasMore?: unknown }).hasMore;

      const preview = await resolvePreviewUrlForTool(
        normalized.docName,
        {
          config: deps.config,
          resolveCwd: deps.resolveCwd,
        },
        cwd,
      );
      const projected = {
        entries,
        ...(typeof total === 'number' ? { total } : {}),
        ...(typeof hasMore === 'boolean' ? { truncated: hasMore } : {}),
      };
      return textPlusStructured(JSON.stringify(projected, null, 2), {
        ...projected,
        previewUrl: preview?.url ?? null,
        ...(preview ? { previewUrlSource: preview.source } : {}),
      });
    },
  );
}
