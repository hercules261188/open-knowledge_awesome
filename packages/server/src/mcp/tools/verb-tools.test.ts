import { describe, expect, test } from 'bun:test';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { type Config, ConfigSchema } from '../../config/schema.ts';
import { register as registerDelete } from './delete.ts';
import { register as registerEdit } from './edit.ts';
import type { ServerInstance } from './shared.ts';
import { register as registerWrite } from './write.ts';

const BASE_CONFIG: Config = ConfigSchema.parse({});

interface ToolResult {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: true;
}
type Handler = (args: Record<string, unknown>) => Promise<ToolResult>;

function capture<D>(register: (server: ServerInstance, deps: D) => void, cwd: string): Handler {
  let handler: Handler | undefined;
  const server = {
    registerTool(_name: string, _cfg: unknown, h: Handler) {
      handler = h;
    },
  } as unknown as ServerInstance;
  register(server, {
    serverUrl: undefined,
    config: BASE_CONFIG,
    resolveCwd: async () => cwd,
  } as unknown as D);
  if (!handler) throw new Error('tool did not register');
  return handler;
}

function newProject(): string {
  return mkdtempSync(join(tmpdir(), 'ok-verb-tools-'));
}

function textOf(r: ToolResult): string {
  return r.content.map((c) => c.text).join('\n');
}

describe('write — exactly-one-target teaching error (D8/D9 mitigation)', () => {
  test('zero targets returns the corrective shape', async () => {
    const write = capture(registerWrite, newProject());
    const r = await write({});
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Name exactly one of');
    expect(textOf(r)).toContain('document'); // the corrective example names the targets
  });

  test('two targets returns a "name exactly ONE" error', async () => {
    const write = capture(registerWrite, newProject());
    const r = await write({ document: { path: 'a', content: '# a' }, folder: { path: 'b' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/name exactly ONE/i);
    expect(textOf(r)).toContain('document');
    expect(textOf(r)).toContain('folder');
  });
});

describe('edit — body-XOR-frontmatter + exactly-one-target teaching errors', () => {
  test('find without replace teaches the corrective shape', async () => {
    const edit = capture(registerEdit, newProject());
    const r = await edit({ document: { path: 'a', find: 'x' } });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('`find` needs a `replace`');
  });

  test('body + frontmatter in one call is rejected', async () => {
    const edit = capture(registerEdit, newProject());
    const r = await edit({
      document: { path: 'a', find: 'x', replace: 'y', frontmatter: { t: 1 } },
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/Pick ONE/i);
  });

  test('zero targets teaches exactly-one-target', async () => {
    const edit = capture(registerEdit, newProject());
    const r = await edit({});
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('Name exactly one of');
  });
});

describe('delete — exactly-one-target teaching error', () => {
  test('two targets rejected', async () => {
    const del = capture(registerDelete, newProject());
    const r = await del({ document: 'a', folder: 'b' });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toMatch(/name exactly ONE/i);
  });
});

describe('edit({ folder }) — fs-direct round-trip to <folder>/.ok/frontmatter.yml', () => {
  test('sets, then merge-patches, then clears the folder frontmatter file', async () => {
    const cwd = newProject();
    const edit = capture(registerEdit, cwd);
    const fmPath = join(cwd, 'meetings', '.ok', 'frontmatter.yml');

    let r = await edit({
      folder: { path: 'meetings', frontmatter: { title: 'Meetings', tags: ['m'] } },
    });
    expect(r.isError).toBeUndefined();
    expect(existsSync(fmPath)).toBe(true);
    expect(parseYaml(readFileSync(fmPath, 'utf-8'))).toEqual({ title: 'Meetings', tags: ['m'] });

    r = await edit({ folder: { path: 'meetings', frontmatter: { description: 'All-hands' } } });
    expect(r.isError).toBeUndefined();
    expect(parseYaml(readFileSync(fmPath, 'utf-8'))).toEqual({
      title: 'Meetings',
      tags: ['m'],
      description: 'All-hands',
    });

    r = await edit({ folder: { path: 'meetings', frontmatter: { tags: null } } });
    expect(r.isError).toBeUndefined();
    expect(parseYaml(readFileSync(fmPath, 'utf-8'))).toEqual({
      title: 'Meetings',
      description: 'All-hands',
    });

    r = await edit({ folder: { path: 'meetings', frontmatter: {} } });
    expect(r.isError).toBeUndefined();
    expect(existsSync(fmPath)).toBe(false);
  });

  test('the on-disk shape has no glob/match key (the fossil is gone)', async () => {
    const cwd = newProject();
    const edit = capture(registerEdit, cwd);
    await edit({ folder: { path: 'specs', frontmatter: { title: 'Specs' } } });
    const parsed = parseYaml(readFileSync(join(cwd, 'specs', '.ok', 'frontmatter.yml'), 'utf-8'));
    expect(parsed).not.toHaveProperty('match');
    expect(parsed).not.toHaveProperty('rules');
  });
});

describe('write/edit/delete({ template }) — fs-direct round-trip', () => {
  test('create → body edit → frontmatter patch → delete', async () => {
    const cwd = newProject();
    const write = capture(registerWrite, cwd);
    const edit = capture(registerEdit, cwd);
    const del = capture(registerDelete, cwd);
    const tplPath = join(cwd, 'fishing-log', '.ok', 'templates', 'trip-log.md');

    let r = await write({
      template: {
        path: 'fishing-log/trip-log',
        content: '# {{date}}\n\nCatch: \n',
        frontmatter: { title: 'Trip Log' },
      },
    });
    expect(r.isError).toBeUndefined();
    expect(existsSync(tplPath)).toBe(true);
    expect(readFileSync(tplPath, 'utf-8')).toContain('Catch:');

    r = await edit({
      template: { path: 'fishing-log/trip-log', find: 'Catch:', replace: 'Total catch:' },
    });
    expect(r.isError).toBeUndefined();
    expect(readFileSync(tplPath, 'utf-8')).toContain('Total catch:');
    expect(readFileSync(tplPath, 'utf-8')).toContain('Trip Log');

    r = await edit({
      template: {
        path: 'fishing-log/trip-log',
        frontmatter: { description: 'one per trip' },
      },
    });
    expect(r.isError).toBeUndefined();
    expect(readFileSync(tplPath, 'utf-8')).toContain('description: one per trip');

    r = await del({ template: { path: 'fishing-log/trip-log' } });
    expect(r.isError).toBeUndefined();
    expect(existsSync(tplPath)).toBe(false);
  });

  test('invalid template name is rejected by the name grammar', async () => {
    const cwd = newProject();
    const write = capture(registerWrite, cwd);
    const r = await write({
      template: { path: 'x/a.b', content: 'ok', frontmatter: { title: 'A' } },
    });
    expect(r.isError).toBe(true);
    expect(textOf(r)).toContain('must be letters, digits');
    expect(existsSync(join(cwd, 'x', '.ok', 'templates', 'a.b.md'))).toBe(false);
  });
});

describe('D13 migration meta-test — no retired tool name survives in the skill surface', () => {
  const RETIRED = [
    'write_document',
    'edit_document',
    'edit_frontmatter',
    'delete_document',
    'folder_config',
    'set_folder_rule',
    'write_template',
    'delete_template',
    'rename_document',
    'rename_folder',
    'get_history',
    'get_config',
    'get_preview_url',
    'get_components',
    'get_authoring_palette',
    'list_conflicts',
    'get_conflict_content',
  ];

  function mdFiles(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) out.push(...mdFiles(p));
      else if (entry.endsWith('.md') || entry.endsWith('.mdx')) out.push(p);
    }
    return out;
  }

  test('packages/server/assets/skills/** teaches only the verb surface', () => {
    const skillsDir = fileURLToPath(new URL('../../../assets/skills', import.meta.url));
    const offenders: string[] = [];
    for (const file of mdFiles(skillsDir)) {
      const body = readFileSync(file, 'utf-8');
      for (const name of RETIRED) {
        if (body.includes(name)) offenders.push(`${file}: ${name}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
