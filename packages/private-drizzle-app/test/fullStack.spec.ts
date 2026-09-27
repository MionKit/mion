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

describe('pg, builder tables, routes with no return annotation', () => {
  it('selectAll', async () => {
    queueRows([annRaw]);
    const [rows, error, fatal] = await client.listUsers();
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
    const [rows, error] = await client.userNames();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{id: ANN, name: 'Ann'}]);
  });

  it('innerJoin', async () => {
    queueRows([[POST, ANN, 'Hello', ['a', 'b'], 150, null, ANN, 'Ann']]);
    const [rows, error, fatal] = await client.postsWithAuthor();
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
    const [rows, error, fatal] = await client.usersAndPosts();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows?.[0].posts?.publishedAt).toEqual(new Date('2026-01-02T03:04:05Z'));
    expect(rows?.[1].posts).toBeNull();
  });

  it('aggregate', async () => {
    queueRows([['admin', '2', '30.5000000000000000', 40]]);
    const [rows, error, fatal] = await client.roleStats();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{role: 'admin', total: 2, avgAge: '30.5000000000000000', maxAge: 40}]);
  });

  it('insertReturning', async () => {
    queueRows([annRaw]);
    const [row, error, fatal] = await client.createUser({name: 'Ann', email: 'ann@x.io', age: 30, role: 'admin', balance: 42n});
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(row?.balance).toBe(42n);
    expect(driverCalls[0].sql).toMatch(/^insert into "users"/);
  });

  it('updateReturning', async () => {
    queueRows([[ANN, 'Anna']]);
    const [row, error, fatal] = await client.renameUser(ANN, 'Anna');
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(row).toEqual({id: ANN, name: 'Anna'});
  });

  it('relations', async () => {
    queueRows([[...annRaw, [[POST, ANN, 'Hello', ['a'], 150, '2026-01-02T03:04:05']]]]);
    const [rows, error, fatal] = await client.usersWithPosts();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows?.[0].posts[0].title).toBe('Hello');
    expect(rows?.[0].posts[0].publishedAt).toEqual(new Date('2026-01-02T03:04:05Z'));
  });

  it('viewColumns', async () => {
    queueRows([[ANN, 'Ann', 30]]);
    const [rows, error, fatal] = await client.adults();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{id: ANN, name: 'Ann', age: 30}]);
  });

  it('viewQueryBuilder', async () => {
    queueRows([[ANN, 150]]);
    const [rows, error, fatal] = await client.busyAuthors();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{authorId: ANN, views: 150}]);
  });

  it('mappedShape', async () => {
    queueRows([[...annRaw, [[POST, ANN, 'Hello', ['a'], 150, null]]]]);
    const [cards, error, fatal] = await client.authorCards();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(cards).toEqual([
      {author: {id: ANN, name: 'Ann', since: new Date('2026-01-02T03:04:05Z')}, postCount: 1, titles: ['Hello']},
    ]);
  });
});

describe('sqlite, builder tables', () => {
  const noteRaw = [1, 'Buy milk', 1, '{"color":"red"}', 4.5, 1767323045];
  const note = {id: 1, title: 'Buy milk', done: true, meta: {color: 'red'}, rating: 4.5, createdAt: new Date(1767323045 * 1000)};

  it('selectAll', async () => {
    queueRows([noteRaw]);
    const [rows, error, fatal] = await client.listNotes();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([note]);
  });

  it('insertReturning', async () => {
    queueRows([noteRaw]);
    const [row, error, fatal] = await client.createNote({
      title: 'Buy milk',
      done: true,
      meta: {color: 'red'},
      rating: 4.5,
      createdAt: note.createdAt,
    });
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(row).toEqual(note);
  });

  it('transaction', async () => {
    queueRows([[1, 3.5, 1767323045]], [[2, 5.5, 1767323045]]);
    const [result, error, fatal] = await client.bumpRatings(1, 2);
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
    const [rows, error, fatal] = await client.listDevices();
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(rows).toEqual([{id: 7, serialNo: 'SN-1', views: 12, builtAt: new Date('2026-01-02T03:04:05Z')}]);
  });

  it('insertReturningId', async () => {
    queueRows([{insertId: 7, affectedRows: 1} as unknown as unknown[]]);
    const [ids, error, fatal] = await client.addDevice({serialNo: 'SN-1', views: 12, builtAt: new Date('2026-01-02T03:04:05Z')});
    expect(fatal).toBeUndefined();
    expect(error).toBeUndefined();
    expect(ids).toEqual({id: 7});
  });
});

describe('format probes: a row that breaks its column format', () => {
  it('selectAll with a 101 char name', async () => {
    queueRows([[ANN, 'x'.repeat(101), 'ann@x.io', 30, 'admin', '42', CREATED]]);
    const [rows, , fatal] = await client.listUsers();
    // toDrizzle rows drop their formats today, so the client accepts the too-long name
    expect(fatal).toBeUndefined();
    expect(rows?.[0].name).toHaveLength(101);
  });
});
