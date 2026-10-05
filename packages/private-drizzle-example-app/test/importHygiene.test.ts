import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {expect, it} from 'vitest';
import {ResolverClient} from '../../devtools/src/core/resolver-client.ts';
import {DIALECTS} from './routeVariants.ts';

it('keeps the real slim schemas, database companions and public routes free of Drizzle diagnostics', async () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const files = DIALECTS.flatMap((dialect) =>
    ['builders', 'types'].flatMap((form) => [
      `${cwd}src/db/${dialect}.${form}.ts`,
      `${cwd}src/db/${dialect}.${form}.db.ts`,
      `${cwd}src/server/${dialect}.${form}.routes.ts`,
    ])
  );
  const client = new ResolverClient(fileURLToPath(new URL('../../../mion-bin/mion', import.meta.url)), cwd, 'tsconfig.json', {
    serverMode: true,
  });
  try {
    await client.setSources(Object.fromEntries(files.map((file) => [file, readFileSync(file, 'utf8')])));
    const diagnostics = (await client.scanFiles(files)).diagnostics ?? [];
    expect(diagnostics.filter((d) => d.code === 'rpc-handler-drizzle-type' || d.code === 'rpc-handler-drizzle-import')).toEqual(
      []
    );
  } finally {
    client.close();
  }
}, 60000);
