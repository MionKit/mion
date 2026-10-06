import {expect, it} from 'vitest';
import {readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';
import {annotateFixtureDiagnostics} from '../../../container/drizzle-e2e/shared/fixture-diagnostics.mjs';
import {ResolverClient} from '../src/core/resolver-client.ts';
import {BIN, makeFixtureProject} from './eslint/fixture.ts';

it('downgrades only diagnosed fixture lines and leaves other files and codes blocking', async () => {
  const schema = `import type {SQL} from 'drizzle-orm';
import type {SQL as OtherSQL} from 'drizzle-orm';
import type {PgTable} from '@mionjs/drizzle-orm-pg-core';
export type Users = PgTable<'users', {id: number}>;`;
  const project = makeFixtureProject({
    'tsconfig.json': JSON.stringify({
      compilerOptions: {target: 'ESNext', module: 'NodeNext', moduleResolution: 'NodeNext', skipLibCheck: true},
      include: ['**/*.ts'],
    }),
    'tests/schema.ts': schema,
    'server.ts': schema,
    'node_modules/@mionjs/drizzle-orm-pg-core/package.json': JSON.stringify({
      name: '@mionjs/drizzle-orm-pg-core',
      exports: {'.': './index.d.ts'},
    }),
    'node_modules/@mionjs/drizzle-orm-pg-core/index.d.ts':
      'export interface PgTable<Name extends string,Cols>{name:Name; columns:Cols}',
    'node_modules/drizzle-orm/package.json': JSON.stringify({name: 'drizzle-orm', types: 'index.d.ts'}),
    'node_modules/drizzle-orm/index.d.ts': 'export interface SQL {text:string}',
  });
  const generate = async () => {
    const resolver = new ResolverClient(BIN, project.dir, path.join(project.dir, 'tsconfig.json'));
    try {
      return (await resolver.generate()).diagnostics ?? [];
    } finally {
      resolver.close();
    }
  };
  try {
    const before = await generate();
    expect(before.filter((d) => d.code === 'drizzle-mixed-types')).toHaveLength(4);
    expect(
      annotateFixtureDiagnostics(project.dir, [
        ...before,
        ...before,
        {code: 'validate-symbol-root', site: {filePath: 'tests/schema.ts', startLine: 3}},
      ])
    ).toBe(2);
    const source = readFileSync(path.join(project.dir, 'tests/schema.ts'), 'utf8');
    expect(source).toBe(schema.replaceAll('import type {SQL', '// @mion-downgrade-error drizzle-mixed-types\nimport type {SQL'));
    expect(readFileSync(path.join(project.dir, 'server.ts'), 'utf8')).toBe(schema);
    const after = await generate();
    const findings = after.filter((d) => d.code === 'drizzle-mixed-types');
    expect(findings).toHaveLength(4);
    expect(findings.filter((d) => d.site.filePath.endsWith('tests/schema.ts')).every((d) => d.downgraded)).toBe(true);
    expect(findings.filter((d) => d.site.filePath.endsWith('server.ts')).every((d) => !d.downgraded)).toBe(true);
    expect(after.filter((d) => d.code.startsWith('comment-'))).toEqual([]);
    expect(annotateFixtureDiagnostics(project.dir, after)).toBe(0);
    writeFileSync(path.join(project.dir, 'tests/schema.ts'), `${source}\nimport type {SQL as ExtraSQL} from 'drizzle-orm';`);
    const additional = (await generate()).filter((d) => d.code === 'drizzle-mixed-types');
    expect(
      additional
        .filter((d) => d.site.filePath.endsWith('tests/schema.ts'))
        .map((d) => d.downgraded === true)
        .sort()
    ).toEqual([false, true, true]);
  } finally {
    project.cleanup();
  }
}, 60_000);
