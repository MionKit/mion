/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Route-level e2e for the drizzle-derived models: the test server's dbUsers
// routes take/return InferInsert/InferSelect/InferUpdate types of a REFINED
// proxy-built table, and everything on the wire is generated from those types:
// - insert/select/update payloads validate the captured (varchar maxLength)
//   AND refined (minLength, min) params before the handler runs;
// - the update payload is a real partial that still validates present keys;
// - Date columns survive the default JSON serializer in BOTH directions
//   (serialized on send, revived to a real Date on receive) with no
//   hand-written serialization anywhere.

import {describe, it, expect} from 'vitest';
import {initClient} from './client.ts';
import {HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

const baseURL = TEST_SERVER_BASE_URL;
const authHeaders = new HeadersSubset({Authorization: 'XWYZ-TOKEN'});

function client() {
  const {routes, middleFns} = initClient<TestServerApi>({baseURL});
  // a sub-request resolves once, so every call gets a FRESH auth middleFn
  const callOpts = () => ({middleFns: {auth: middleFns.auth(authHeaders)}});
  return {routes, callOpts};
}

describe('drizzle-derived models over real routes', () => {
  it('insert accepts a valid payload and returns server-generated id + Date', async () => {
    const {routes, callOpts} = client();
    const [row, routeError, fatal] = await routes.dbUsers.insert({name: 'Anna Smith', age: 30}).call(callOpts());
    expect(routeError).toBeUndefined();
    expect(fatal).toBeUndefined();
    expect(row?.name).toBe('Anna Smith');
    expect(row?.age).toBe(30);
    expect(typeof row?.id).toBe('string');
    // Date generated server-side arrives as a REAL revived Date, not a string
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('a Date sent by the client round-trips to the exact same instant', async () => {
    const {routes, callOpts} = client();
    const createdAt = new Date('2026-01-02T03:04:05.678Z');
    const [row, routeError] = await routes.dbUsers.insert({name: 'Bruno Malik', age: 44, createdAt}).call(callOpts());
    expect(routeError).toBeUndefined();
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it('insert rejects the refined bounds before the handler runs', async () => {
    const {routes, callOpts} = client();
    // name below the refined minLength 5
    const [shortName, shortNameError] = await routes.dbUsers.insert({name: 'abc', age: 30}).call(callOpts());
    expect(shortName).toBeUndefined();
    expect(shortNameError?.type).toBe('validation-error');
    // age below the refined min 18
    const [minor, minorError] = await routes.dbUsers.insert({name: 'Charlie Young', age: 17}).call(callOpts());
    expect(minor).toBeUndefined();
    expect(minorError?.type).toBe('validation-error');
    // name beyond the CAPTURED varchar maxLength 100
    const [tooLong, tooLongError] = await routes.dbUsers.insert({name: 'x'.repeat(101), age: 30}).call(callOpts());
    expect(tooLong).toBeUndefined();
    expect(tooLongError?.type).toBe('validation-error');
  });

  it('select returns the stored row with its Date revived', async () => {
    const {routes, callOpts} = client();
    const [inserted] = await routes.dbUsers.insert({name: 'Diana Prince', age: 35}).call(callOpts());
    const [row, routeError] = await routes.dbUsers.select(inserted!.id).call(callOpts());
    expect(routeError).toBeUndefined();
    expect(row?.name).toBe('Diana Prince');
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.getTime()).toBe(inserted!.createdAt.getTime());
  });

  it('update takes a partial patch, keeps the rest, and still validates present keys', async () => {
    const {routes, callOpts} = client();
    const [inserted] = await routes.dbUsers.insert({name: 'Edgar Allan', age: 40}).call(callOpts());

    const [updated, updateError] = await routes.dbUsers.update(inserted!.id, {age: 41}).call(callOpts());
    expect(updateError).toBeUndefined();
    expect(updated?.age).toBe(41);
    expect(updated?.name).toBe('Edgar Allan'); // untouched key kept
    expect(updated?.createdAt).toBeInstanceOf(Date);

    // an empty patch is legal (everything optional)...
    const [unchanged, emptyError] = await routes.dbUsers.update(inserted!.id, {}).call(callOpts());
    expect(emptyError).toBeUndefined();
    expect(unchanged?.age).toBe(41);

    // ...but a present key still enforces the refined bound
    const [rejected, patchError] = await routes.dbUsers.update(inserted!.id, {name: 'abc'}).call(callOpts());
    expect(rejected).toBeUndefined();
    expect(patchError?.type).toBe('validation-error');
  });

  it('a declared route error still flows for a missing row', async () => {
    const {routes, callOpts} = client();
    const [row, routeError] = await routes.dbUsers.select('793aff46-42ac-4372-b7fa-c48ba48ed94f').call(callOpts());
    expect(row).toBeUndefined();
    expect(routeError?.type).toBe('user-not-found');
  });
});
