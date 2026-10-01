import type {Server} from 'node:http';
import {startApp} from '../src/server/app.ts';
import {createAppClient, type AppClient} from '../src/client/client.ts';
import {driverCalls, queueRows, resetDriver} from '../src/db/fakeDriver.ts';
import {ANN, BOB, CREATED, FIXTURES, MYSQL_WRITE, expectedPost, expectedUser} from './fixtures.ts';
import {DIALECTS, VARIANTS, type Dialect, type Variant} from './routeVariants.ts';

const PORT = 8096;
let server: Server;
let client: AppClient;

beforeAll(async () => {
  server = await startApp(PORT);
  client = createAppClient(`http://localhost:${PORT}`);
});
afterAll(async () => {
  await new Promise<void>((done) => server.close(() => done()));
});
beforeEach(() => resetDriver());

// the SQL each variant sent, per dialect and route, so the three can be compared
const sent = new Map<string, Map<Variant, string[]>>();
function record(dialect: Dialect, variant: Variant, route: string): void {
  const key = `${dialect} ${route}`;
  if (!sent.has(key)) sent.set(key, new Map());
  sent.get(key)!.set(
    variant,
    driverCalls.map((call) => call.sql)
  );
}

describe.each(DIALECTS)('%s', (dialect) => {
  const fx = FIXTURES[dialect];
  // mysql has no `returning`: its writes read the row back with a second query
  const readBack = dialect === 'mysql';

  describe.each(VARIANTS)('%s routes', (variant) => {
    // all variants answer the same shapes at run time; the type pins compare their types
    const api = (): AppClient['pg']['builders'] => client[dialect][variant] as unknown as AppClient['pg']['builders'];
    const done = (route: string) => record(dialect, variant, route);

    it('listUsers', async () => {
      queueRows([fx.user(ANN, 'Ann', 42n)]);
      const [rows, error, response] = await api().listUsers(18).call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([expectedUser(ANN, 'Ann', 42n)]);
      done('listUsers');
    });

    it('userNames', async () => {
      queueRows([[ANN, 'Ann']]);
      const [rows, error, response] = await api().userNames('admin').call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([{id: ANN, name: 'Ann'}]);
      done('userNames');
    });

    it('postsWithAuthor', async () => {
      queueRows([[...fx.post(false), ANN, 'Ann']]);
      const [rows, error, response] = await api().postsWithAuthor().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([{post: expectedPost(false), author: {id: ANN, name: 'Ann'}}]);
      done('postsWithAuthor');
    });

    it('usersAndPosts', async () => {
      queueRows([
        [...fx.user(ANN, 'Ann', 42n), ...fx.post(true)],
        [...fx.user(BOB, 'Bob', 0n), null, null, null, null, null, null],
      ]);
      const [rows, error, response] = await api().usersAndPosts().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([
        {users: expectedUser(ANN, 'Ann', 42n), posts: expectedPost(true)},
        {users: expectedUser(BOB, 'Bob', 0n), posts: null},
      ]);
      done('usersAndPosts');
    });

    it('roleStats', async () => {
      queueRows([fx.stats.raw]);
      const [rows, error, response] = await api().roleStats().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([{role: 'admin', total: 2, avgAge: fx.stats.avgAge, maxAge: 40}]);
      done('roleStats');
    });

    it('createUser', async () => {
      if (readBack) queueRows(MYSQL_WRITE);
      queueRows([fx.user(ANN, 'Ann', 42n)]);
      const newUser = {
        id: ANN,
        name: 'Ann',
        email: 'ann@x.io',
        age: 30,
        role: 'admin' as const,
        active: true,
        balance: 42n,
        createdAt: CREATED,
      };
      const [row, error, response] = await api().createUser(newUser).call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(row).toEqual(expectedUser(ANN, 'Ann', 42n));
      expect(driverCalls[0].sql).toMatch(/^insert into [`"]users[`"]/);
      done('createUser');
    });

    it('renameUser', async () => {
      if (readBack) queueRows(MYSQL_WRITE);
      queueRows([[ANN, 'Anna']]);
      const [row, error, response] = await api().renameUser(ANN, {name: 'Anna'}).call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(row).toEqual({id: ANN, name: 'Anna'});
      done('renameUser');
    });

    it('usersWithPosts', async () => {
      queueRows([[...fx.user(ANN, 'Ann', 42n), fx.nestedPosts([fx.nestedPost(true)])]]);
      const [rows, error, response] = await api().usersWithPosts().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([{...expectedUser(ANN, 'Ann', 42n), posts: [expectedPost(true)]}]);
      done('usersWithPosts');
    });

    it('adults', async () => {
      queueRows([[ANN, 'Ann', 30]]);
      const [rows, error, response] = await api().adults().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([{id: ANN, name: 'Ann', age: 30}]);
      done('adults');
    });

    it('busyAuthors', async () => {
      queueRows([[ANN, 150]]);
      const [rows, error, response] = await api().busyAuthors().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(rows).toEqual([{authorId: ANN, views: 150}]);
      done('busyAuthors');
    });

    it('moveBalance', async () => {
      queueRows([fx.balance(ANN, 32n)], [fx.balance(BOB, 52n)]);
      const [result, error, response] = await api().moveBalance(ANN, BOB, 10n).call();
      expect(error).toBeUndefined();
      if (dialect === 'sqlite') {
        expect(response['@thrownErrors']).toBeUndefined();
        expect(result).toEqual({from: {id: ANN, balance: 32n}, to: {id: BOB, balance: 52n}});
      } else {
        // drizzle's pg-proxy and mysql-proxy drivers refuse transactions; flips once drizzle supports them
        expect(response['@thrownErrors']?.[0]?.type).toBe('unknown-error');
      }
      done('moveBalance');
    });

    it('authorCards', async () => {
      queueRows([[...fx.user(ANN, 'Ann', 42n), fx.nestedPosts([fx.nestedPost(false)])]]);
      const [cards, error, response] = await api().authorCards().call();
      expect({error, thrown: response['@thrownErrors']}).toEqual({error: undefined, thrown: undefined});
      expect(cards).toEqual([{author: {id: ANN, name: 'Ann', since: CREATED}, postCount: 1, titles: ['Hello']}]);
      done('authorCards');
    });

    it('a row that breaks a column format', async () => {
      queueRows([fx.user(ANN, 'x'.repeat(101), 42n)]);
      const [, , response] = await api().listUsers(18).call();
      // the slim models keep maxLength 100, so the client rejects it; plain drizzle types have no formats
      if (variant === 'drizzle') expect(response['@thrownErrors']).toBeUndefined();
      else expect(response['@thrownErrors']?.[0]?.type).toBe('response-validation-error');
    });
  });

  it('the three variants send the same SQL for every route', () => {
    const routes = [...sent.keys()].filter((key) => key.startsWith(`${dialect} `));
    expect(routes.length).toBe(12);
    for (const route of routes) {
      const byVariant = sent.get(route)!;
      expect(byVariant.get('types'), route).toEqual(byVariant.get('builders'));
      expect(byVariant.get('drizzle'), route).toEqual(byVariant.get('builders'));
    }
  });
});
