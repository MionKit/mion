import {expect, it, vi} from 'vitest';
import type {UnpluginContextMeta} from 'unplugin';
import {unplugin} from '../src/core/unplugin.ts';
import {referencesMarkerModule} from '../src/lint/prefilter.ts';
import {BIN, makeFixtureProject} from './eslint/fixture.ts';
import {ResolverClient} from '../src/core/resolver-client.ts';
import path from 'node:path';

it('reports schema isolation during a bundler fallback transform with no marker sites', async () => {
  const clean = `import type {PgTable} from '@mionjs/drizzle-orm-pg-core';
export type Users=PgTable<'users',{id:number}>;`;
  const mixed = clean + "\nimport type {SQL} from 'drizzle-orm';";
  const project = makeFixtureProject({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true, noEmit: true},
      include: ['*.ts'],
    }),
    'schema.ts': mixed,
    'node_modules/@mionjs/drizzle-orm-pg-core/package.json': JSON.stringify({
      name: '@mionjs/drizzle-orm-pg-core',
      exports: {'.': './index.d.ts'},
    }),
    'node_modules/@mionjs/drizzle-orm-pg-core/index.d.ts':
      'export interface PgTable<Name extends string,Cols>{name:Name; columns:Cols}',
    'node_modules/drizzle-orm/package.json': JSON.stringify({name: 'drizzle-orm', types: 'index.d.ts'}),
    'node_modules/drizzle-orm/index.d.ts': 'export interface SQL {text:string}',
  });
  const raw = unplugin.raw(
    {
      binary: BIN,
      cwd: project.dir,
      tsconfig: 'tsconfig.json',
      detachResolver: true,
      downgradeErrors: ['drizzle-mixed-types'],
    },
    {
      framework: 'webpack',
      versions: {},
    } as UnpluginContextMeta
  );
  const plugin = (Array.isArray(raw) ? raw[0] : raw) as {
    buildStart?: (this: unknown) => Promise<void>;
    transform?: (this: unknown, code: string, id: string) => Promise<unknown>;
    buildEnd?: (this: unknown) => void;
  };
  const ctx = {
    warn: vi.fn(),
    error(message: unknown) {
      throw new Error(String(message));
    },
  };
  try {
    const file = path.join(project.dir, 'schema.ts');
    expect(referencesMarkerModule(mixed, file)).toBe(false);
    const inspector = new ResolverClient(BIN, project.dir, path.join(project.dir, 'tsconfig.json'));
    try {
      expect((await inspector.generate()).siteFiles).toEqual([]);
    } finally {
      inspector.close();
    }
    await plugin.buildStart?.call(ctx);
    ctx.warn.mockClear();
    expect(await plugin.transform!.call(ctx, mixed, file)).toBeNull();
    expect(ctx.warn.mock.calls.flat().join('\n')).toContain('drizzle-mixed-types');
  } finally {
    await plugin.buildEnd?.call(ctx);
    project.cleanup();
  }
}, 60_000);
