import type {Server} from 'node:http';
import {startApp} from '../src/server/app.ts';
import {createAppClient, type AppClient} from '../src/client/client.ts';
import {driverCalls, queueRows, resetDriver} from '../src/db/fakeDriver.ts';

const PORT = 8096;
const ANN = '793aff46-42ac-4372-b7fa-c48ba48ed94f';
const BOB = '0f8fad5b-d9cb-469f-a165-70867728950e';
const POST = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const CREATED = '2026-01-02 03:04:05';
const annRaw = [ANN, 'Ann', 'ann@x.io', 30, 'admin', '42', CREATED];

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

// the same cases twice: return types inferred from drizzle, and written by hand from the slim models
describe.each(['pg', 'pgTyped'] as const)('pg, builder tables, %s routes', (group) => {
  // both groups answer the same shapes at run time; the type test checks they are the same types
  const pg = (): AppClient['pg'] => client[group] as AppClient['pg'];

  it('selectAll', async () => {
    queueRows([annRaw]);
    const [rows, error, fatal] = await pg().listUsers().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows?.[0]).toEqual({
      id: ANN,
      name: 'Ann',
      email: 'ann@x.io',
      age: 30,
      role: 'admin',
      balance: 42n,
      createdAt: new Date('2026-01-02T03:04:05Z'),
    });
    expect(driverCalls[0].sql).toContain('from "users"');
  });

  it('partialSelect', async () => {
    queueRows([[ANN, 'Ann']]);
    const [rows, error] = await pg().userNames().call();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{id: ANN, name: 'Ann'}]);
  });

  it('innerJoin', async () => {
    queueRows([[POST, ANN, 'Hello', ['a', 'b'], 150, null, ANN, 'Ann']]);
    const [rows, error, fatal] = await pg().postsWithAuthor().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([
      {
        post: {id: POST, authorId: ANN, title: 'Hello', tags: ['a', 'b'], views: 150, publishedAt: null},
        author: {id: ANN, name: 'Ann'},
      },
    ]);
  });

  it('leftJoin', async () => {
    queueRows([
      [...annRaw, POST, ANN, 'Hello', ['a'], 150, CREATED],
      [BOB, 'Bob', 'bob@x.io', 20, 'user', '0', CREATED, null, null, null, null, null, null],
    ]);
    const [rows, error, fatal] = await pg().usersAndPosts().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows?.[0].posts?.publishedAt).toEqual(new Date('2026-01-02T03:04:05Z'));
    expect(rows?.[1].posts).toBeNull();
  });

  it('aggregate', async () => {
    queueRows([['admin', '2', '30.5000000000000000', 40]]);
    const [rows, error, fatal] = await pg().roleStats().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{role: 'admin', total: 2, avgAge: '30.5000000000000000', maxAge: 40}]);
  });

  it('insertReturning', async () => {
    queueRows([annRaw]);
    const [row, error, fatal] = await pg()
      .createUser({name: 'Ann', email: 'ann@x.io', age: 30, role: 'admin', balance: 42n})
      .call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(row?.balance).toBe(42n);
    expect(driverCalls[0].sql).toMatch(/^insert into "users"/);
  });

  it('updateReturning', async () => {
    queueRows([[ANN, 'Anna']]);
    const [row, error, fatal] = await pg().renameUser(ANN, 'Anna').call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(row).toEqual({id: ANN, name: 'Anna'});
  });

  it('relations', async () => {
    queueRows([[...annRaw, [[POST, ANN, 'Hello', ['a'], 150, '2026-01-02T03:04:05']]]]);
    const [rows, error, fatal] = await pg().usersWithPosts().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows?.[0].posts[0].title).toBe('Hello');
    expect(rows?.[0].posts[0].publishedAt).toEqual(new Date('2026-01-02T03:04:05Z'));
  });

  it('viewColumns', async () => {
    queueRows([[ANN, 'Ann', 30]]);
    const [rows, error, fatal] = await pg().adults().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{id: ANN, name: 'Ann', age: 30}]);
  });

  it('viewQueryBuilder', async () => {
    queueRows([[ANN, 150]]);
    const [rows, error, fatal] = await pg().busyAuthors().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{authorId: ANN, views: 150}]);
  });

  it('mappedShape', async () => {
    queueRows([[...annRaw, [[POST, ANN, 'Hello', ['a'], 150, null]]]]);
    const [cards, error, fatal] = await pg().authorCards().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(cards).toEqual([
      {author: {id: ANN, name: 'Ann', since: new Date('2026-01-02T03:04:05Z')}, postCount: 1, titles: ['Hello']},
    ]);
  });

  it('selectAll with a 101 char name', async () => {
    queueRows([[ANN, 'x'.repeat(101), 'ann@x.io', 30, 'admin', '42', CREATED]]);
    const [, , fatal] = await pg().listUsers().call();
    // the row keeps maxLength 100, so the client rejects the response
    expect(fatal?.type).toBe('response-validation-error');
  });
});

describe('sqlite, builder tables', () => {
  const noteRaw = [1, 'Buy milk', 1, '{"color":"red"}', 4.5, 1767323045];
  const note = {id: 1, title: 'Buy milk', done: true, meta: {color: 'red'}, rating: 4.5, createdAt: new Date(1767323045 * 1000)};

  it('selectAll', async () => {
    queueRows([noteRaw]);
    const [rows, error, fatal] = await client.sqlite.listNotes().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([note]);
  });

  it('insertReturning', async () => {
    queueRows([noteRaw]);
    const [row, error, fatal] = await client.sqlite
      .createNote({
        title: 'Buy milk',
        done: true,
        meta: {color: 'red'},
        rating: 4.5,
        createdAt: note.createdAt,
      })
      .call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(row).toEqual(note);
  });

  it('transaction', async () => {
    queueRows([[1, 3.5, 1767323045]], [[2, 5.5, 1767323045]]);
    const [result, error, fatal] = await client.sqlite.bumpRatings(1, 2).call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(result).toEqual({
      from: {id: 1, rating: 3.5, createdAt: note.createdAt},
      to: {id: 2, rating: 5.5, createdAt: note.createdAt},
    });
    expect(driverCalls.map((call) => call.sql.split(' ')[0].toLowerCase())).toEqual(['begin', 'update', 'update', 'commit']);
  });
});

describe('mysql, builder tables', () => {
  it('selectAll', async () => {
    queueRows([[7, 'SN-1', 12, '2026-01-02 03:04:05']]);
    const [rows, error, fatal] = await client.mysql.listDevices().call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{id: 7, serialNo: 'SN-1', views: 12, builtAt: new Date('2026-01-02T03:04:05Z')}]);
  });

  it('insertReturningId', async () => {
    queueRows([{insertId: 7, affectedRows: 1} as unknown as unknown[]]);
    const [ids, error, fatal] = await client.mysql
      .addDevice({serialNo: 'SN-1', views: 12, builtAt: new Date('2026-01-02T03:04:05Z')})
      .call();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(ids).toEqual({id: 7});
  });
});
