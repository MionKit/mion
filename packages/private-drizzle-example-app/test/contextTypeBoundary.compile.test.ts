import {describe, expect, it} from 'vitest';
import {mkdirSync, writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {measureCase, measureRegisteredClient} from './costHarness.ts';
import {DIALECTS} from './routeVariants.ts';

describe.each(DIALECTS)('%s database context boundary', (dialect) => {
  it('measures database context cost separately from public result types', () => {
    const imports = `import {createMionRouter} from '@mionjs/router';
import type {CallContext} from '@mionjs/router';
import {db, usersDb} from '../db/${dialect}.types.db.ts';
import type {User} from '../db/${dialect}.types.ts';`;
    // every factory writes its return type: an inferred one is computed by every client
    const dbRouter = 'createMionRouter({sharedDataFactory: (): {db: typeof db} => ({db})})';
    const results = [
      ['empty context', 'createMionRouter({})', '_ctx', 'db'],
      [
        'small context',
        "createMionRouter({sharedDataFactory: (): {requestId: string} => ({requestId: 'request'})})",
        '_ctx',
        'db',
      ],
      ['database context', dbRouter, 'ctx', 'ctx.shared.db'],
      ['unused database context', dbRouter, '_ctx', 'db'],
      ['light handler context', dbRouter, '_ctx: CallContext<{}>', 'db'],
      [
        'opaque database context',
        'createMionRouter({sharedDataFactory: (): {db: unknown} => ({db})})',
        'ctx',
        '(ctx.shared.db as typeof db)',
      ],
      ['written database context', dbRouter, 'ctx: CallContext<{db: typeof db}>', 'ctx.shared.db'],
    ].map(([name, router, context, database]) => {
      const measured = measureCase(`${imports}\nconst mion = ${router};`, {
        name,
        body: `list: mion.route(async (${context}, id: User['id']): Promise<User[]> => ${database}.select().from(usersDb))`,
        paramsOnly: `list: mion.route((${context}, id: User['id']): void => {})`,
      });
      expect(measured.errors, name).toEqual([]);
      const registered = measureRegisteredClient(
        `${imports}\nconst mion = ${router};`,
        `list: mion.route(async (${context}, id: User['id']): Promise<User[]> => ${database}.select().from(usersDb))`
      );
      expect(registered.errors, name).toEqual([]);
      return {name, client: measured.rawClient, registeredClient: registered.client};
    });
    const cost = (name: string) => results.find((r) => r.name === name)!.client;
    expect(cost('unused database context')).toBe(cost('database context'));
    expect(cost('opaque database context')).toBeLessThan(cost('empty context') * 1.1);

    const exposed = measureCase(`${imports}\nconst mion = createMionRouter({sharedDataFactory: (): {db: unknown} => ({db})});`, {
      name: 'inferred database result',
      body: "list: mion.route(async (ctx, id: User['id']) => (ctx.shared.db as typeof db).select().from(usersDb))",
      paramsOnly: "list: mion.route((ctx, id: User['id']): void => {})",
    });
    expect(exposed.errors).toEqual([]);
    expect(exposed.rawClient).toBeGreaterThan(cost('opaque database context'));
    const report = fileURLToPath(new URL('../reports/', import.meta.url));
    mkdirSync(report, {recursive: true});
    writeFileSync(
      `${report}${dialect}-context-cost.json`,
      JSON.stringify({dialect, results, inferredResultClient: exposed.rawClient}, null, 2) + '\n'
    );
  }, 900_000);
});
