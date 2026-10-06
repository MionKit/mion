import {expect, it, vi} from 'vitest';
vi.setConfig({testTimeout: 60000});
import {database, fixture, scan, tables, SCHEMA_CODE, TYPE_CODE} from './lintFixture.ts';
import fs from 'node:fs';
import {ResolverClient} from '../../devtools/src/core/resolver-client.ts';
import {Family} from '../../devtools/src/core/protocol.ts';

const codes = (diags: Awaited<ReturnType<typeof scan>> | undefined) =>
  diags
    ?.map((d) => d.code)
    .filter((code) => code === SCHEMA_CODE || code === TYPE_CODE)
    .sort();

it.each(['filesystem', 'resolver'] as const)('cleans up rejected fixture setup: %s', async (stage) => {
  const failure = new Error('fixture setup failed');
  let directory = '';
  const createDirectory = fs.mkdtempSync;
  vi.spyOn(fs, 'mkdtempSync').mockImplementation((...args) => {
    directory = createDirectory(...args);
    return directory;
  });
  const closed = vi.spyOn(ResolverClient.prototype, 'close');
  const sources = vi.spyOn(ResolverClient.prototype, 'setSources');
  if (stage === 'filesystem') {
    vi.spyOn(fs, 'symlinkSync').mockImplementationOnce(() => {
      throw failure;
    });
  } else {
    sources.mockRejectedValue(failure);
  }
  try {
    await expect(fixture({'schema.ts': tables()})).rejects.toBe(failure);
    expect(directory).not.toBe('');
    expect(fs.existsSync(directory)).toBe(false);
    if (stage === 'resolver') expect(closed).toHaveBeenCalledOnce();
  } finally {
    for (const context of sources.mock.contexts) (context as ResolverClient).close();
    fs.rmSync(directory, {recursive: true, force: true});
    vi.restoreAllMocks();
  }
});

it('agrees across scan, transform and generate without opting into old lint rules', async () => {
  const f = await fixture({
    'schema.ts': tables() + "\nimport type {SQL} from 'drizzle-orm';",
    'db.ts': database(),
    'routes.ts': `import {query} from '@mionjs/router';import type {DbUser} from './db.ts';
 export const list=query(async (_ctx):Promise<DbUser[]>=>[]);`,
  });
  try {
    const scanned = await f.client.scanFiles(f.files);
    expect(codes(scanned.diagnostics)).toEqual([SCHEMA_CODE, TYPE_CODE].sort());
    expect(scanned.diagnostics?.filter((d) => d.code === SCHEMA_CODE || d.code === TYPE_CODE).map((d) => d.family)).toEqual([
      Family.Drizzle,
      Family.Drizzle,
    ]);
    expect(codes((await f.client.transform(f.files)).diagnostics)).toEqual(codes(scanned.diagnostics));
    expect(codes((await f.client.generate()).diagnostics)).toEqual(codes(scanned.diagnostics));
  } finally {
    f.close();
  }
});
it('lets existing diagnostic directives suppress and downgrade schema isolation', async () => {
  const source = tables() + "\nimport type {SQL} from 'drizzle-orm';";
  const suppressed = await scan({'schema.ts': '/* @mion-expect-error ' + SCHEMA_CODE + ' */\n' + source}, 'schema.ts');
  expect(suppressed.filter((d) => d.code === SCHEMA_CODE)).toEqual([]);
  const downgraded = await scan({'schema.ts': '/* @mion-downgrade-error ' + SCHEMA_CODE + ' */\n' + source}, 'schema.ts');
  expect(downgraded.filter((d) => d.code === SCHEMA_CODE)).toMatchObject([{downgraded: true}]);
});

it.each(['scan', 'generate'] as const)('reports stale Drizzle directives during %s', async (operation) => {
  const f = await fixture({'schema.ts': `/* @mion-expect-error ${SCHEMA_CODE} */\n${tables()}`});
  try {
    const result = operation === 'scan' ? await f.client.scanFiles(f.files) : await f.client.generate();
    expect(result.diagnostics?.filter((d) => d.code === 'comment-expect-error-unused')).toHaveLength(1);
  } finally {
    f.close();
  }
});

it('a compiler build succeeds with a public-type warning and fails with schema isolation', async () => {
  const {spawnSync} = await import('node:child_process');
  const {default: path} = await import('node:path');
  const {default: fs} = await import('node:fs');
  for (const [mixed, code, status] of [
    [false, TYPE_CODE, 0],
    [true, SCHEMA_CODE, 1],
  ] as const) {
    const f = await fixture(
      mixed
        ? {'schema.ts': tables() + "\nimport type {SQL} from 'drizzle-orm';"}
        : {
            'schema.ts': tables(),
            'db.ts': database(),
            'routes.ts': `import {query} from '@mionjs/router';import type {DbUser} from './db.ts';
      export const list=query(async (_ctx):Promise<DbUser[]>=>[]);`,
          }
    );
    try {
      const config = JSON.parse(fs.readFileSync(f.path('tsconfig.json'), 'utf8'));
      Object.assign(config.compilerOptions, {noEmit: false, rewriteRelativeImportExtensions: true, outDir: f.path('emitted')});
      fs.writeFileSync(f.path('tsconfig.json'), JSON.stringify(config));
      const result = spawnSync(
        path.resolve(__dirname, '../../../mion-bin/mion'),
        ['compile', '--cwd', f.path('.'), '--tsconfig', f.path('tsconfig.json'), '--gen-dir', f.path('compiled')],
        {encoding: 'utf8'}
      );
      expect(result.error).toBeUndefined();
      expect(result.status, result.stdout + result.stderr).toBe(status);
      expect(result.stdout + result.stderr).toContain(code);
    } finally {
      f.close();
    }
  }
}, 60000);

it('does not duplicate the new checks when old router checks are enabled and matches edit mode', async () => {
  const f = await fixture({
    'schema.ts': tables() + "\nimport type {SQL} from 'drizzle-orm';",
    'db.ts': database(),
    'routes.ts': `import {query} from '@mionjs/router';import type {DbUser} from './db.ts';
 export const list=query((_ctx):DbUser=>({id:1,name:'Ada'}));`,
  });
  try {
    const standard = codes((await f.client.scanFiles(f.files)).diagnostics);
    expect(codes((await f.client.scanFiles(f.files, {checkRouterRules: true})).diagnostics)).toEqual(standard);
    expect(codes((await f.client.transform(f.files, {emitEdits: true})).diagnostics)).toEqual(standard);
  } finally {
    f.close();
  }
});
it('updates package ownership after a source overlay changes', async () => {
  const files = {
    'vendor/package.json': JSON.stringify({name: 'lookalike'}),
    'vendor/index.ts': 'export interface Row {id:number}',
    'routes.ts': `import {query} from '@mionjs/router';import type {Row} from './vendor/index.ts';export const list=query((_ctx):Row=>({id:1}));`,
  };
  const f = await fixture(files);
  try {
    expect(((await f.client.scanFiles([f.path('routes.ts')])).diagnostics ?? []).filter((d) => d.code === TYPE_CODE)).toEqual([]);
    await f.client.setSources({
      [f.path('vendor/package.json')]: JSON.stringify({name: 'drizzle-orm'}),
      [f.path('routes.ts')]: files['routes.ts'],
    });
    expect(
      ((await f.client.scanFiles([f.path('routes.ts')])).diagnostics ?? []).filter((d) => d.code === TYPE_CODE)
    ).toHaveLength(1);
  } finally {
    f.close();
  }
});

it('reports user public types without reporting mixed schemas owned by dependencies', async () => {
  const f = await fixture({
    'node_modules/vendor/package.json': JSON.stringify({name: 'vendor', type: 'module', exports: './index.ts'}),
    'node_modules/vendor/index.ts': tables() + "\nexport type Row=import('drizzle-orm').SQL;",
    'routes.ts': `import {query} from '@mionjs/router';import type {Row} from 'vendor';
 export const list=query((_ctx):Row=>{throw new Error('fixture')});`,
  });
  try {
    const generated = (await f.client.generate()).diagnostics ?? [];
    expect(generated.filter((d) => d.code === SCHEMA_CODE)).toEqual([]);
    expect(generated.filter((d) => d.code === TYPE_CODE)).toHaveLength(1);
    expect(generated.find((d) => d.code === TYPE_CODE)?.site.filePath).toBe(f.path('routes.ts'));
  } finally {
    f.close();
  }
});
