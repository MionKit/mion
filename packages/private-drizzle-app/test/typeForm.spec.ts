import {eq} from 'drizzle-orm';
import * as builders from '../src/db/pg.db.ts';
import * as typeForm from '../src/db/pg.types.db.ts';
import {driverCalls, queueRows, resetDriver} from '../src/db/fakeDriver.ts';

const ANN = '793aff46-42ac-4372-b7fa-c48ba48ed94f';
const POST = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const annRaw = [ANN, 'Ann', 'ann@x.io', 30, 'admin', '42', '2026-01-02 03:04:05'];

beforeEach(() => resetDriver());

// the marker form resolves at build time; these run the same queries on both forms and compare
describe('pg tables written as types run the same queries as builder tables', () => {
  it('select', async () => {
    queueRows([annRaw], [annRaw]);
    const fromTypes = await typeForm.db.select().from(typeForm.usersDb).where(eq(typeForm.usersDb.id, ANN));
    const fromBuilders = await builders.db.select().from(builders.usersDb).where(eq(builders.usersDb.id, ANN));
    expect(fromTypes).toEqual(fromBuilders);
    expect(fromTypes[0].balance).toBe(42n);
    expect(driverCalls[0].sql).toBe(driverCalls[1].sql);
  });

  it('relations', async () => {
    const raw = [[...annRaw, [[POST, ANN, 'Hello', ['a'], 150, null]]]];
    queueRows(raw, raw);
    const fromTypes = await typeForm.db.query.users.findMany({with: {posts: true}});
    const fromBuilders = await builders.db.query.users.findMany({with: {posts: true}});
    expect(fromTypes).toEqual(fromBuilders);
    expect(driverCalls[0].sql).toBe(driverCalls[1].sql);
  });

  it('insert returning', async () => {
    queueRows([annRaw], [annRaw]);
    const user = {name: 'Ann', email: 'ann@x.io', age: 30, role: 'admin' as const, balance: 42n};
    const fromTypes = await typeForm.db.insert(typeForm.usersDb).values(user).returning();
    const fromBuilders = await builders.db.insert(builders.usersDb).values(user).returning();
    expect(fromTypes).toEqual(fromBuilders);
    expect(driverCalls[0].sql).toBe(driverCalls[1].sql);
  });
});
