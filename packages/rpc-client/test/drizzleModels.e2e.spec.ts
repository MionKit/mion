/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The test server's dbUsers routes use the select, insert and Partial-insert models of a REFINED proxy-built table,
// and the wire code is generated from them: payloads validate captured (varchar maxLength) AND refined (minLength, min)
// params before the handler, a patch validates only present keys, and Dates round-trip with no hand-written serializer.

import {describe, it, expect} from 'vitest';
import {initClient} from './lib/fetchingClient.ts';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

const baseURL = TEST_SERVER_BASE_URL;
const authHeaders = new HeadersSubset({Authorization: 'XWYZ-TOKEN'});

function client() {
  const {routes, middlewares} = initClient<TestServerApi>({baseURL});
  middlewares.auth.onRequest((auth) => auth(authHeaders));
  return {routes};
}

describe('drizzle-derived models over real routes', () => {
  it('insert accepts a valid payload and returns server-generated id + Date', async () => {
    const {routes} = client();
    const [row, routeError, response] = await routes.dbUsers.insert({name: 'Anna Smith', age: 30}).call();
    expect(routeError).toBeUndefined();
    expect(response['@thrownErrors']).toBeUndefined();
    expect(row?.name).toBe('Anna Smith');
    expect(row?.age).toBe(30);
    expect(typeof row?.id).toBe('string');
    // Date generated server-side arrives as a REAL revived Date, not a string
    expect(row?.createdAt).toBeInstanceOf(Date);
  });

  it('a Date sent by the client round-trips to the exact same instant', async () => {
    const {routes} = client();
    const createdAt = new Date('2026-01-02T03:04:05.678Z');
    const [row, routeError] = await routes.dbUsers.insert({name: 'Bruno Malik', age: 44, createdAt}).call();
    expect(routeError).toBeUndefined();
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.getTime()).toBe(createdAt.getTime());
  });

  it('insert rejects the refined bounds before the handler runs', async () => {
    const {routes} = client();
    // name below the refined minLength 5
    const [shortName, shortNameError] = await routes.dbUsers.insert({name: 'abc', age: 30}).call();
    expect(shortName).toBeUndefined();
    expect(shortNameError?.type).toBe('validation-error');
    // age below the refined min 18
    const [minor, minorError] = await routes.dbUsers.insert({name: 'Charlie Young', age: 17}).call();
    expect(minor).toBeUndefined();
    expect(minorError?.type).toBe('validation-error');
    // name beyond the CAPTURED varchar maxLength 100
    const [tooLong, tooLongError] = await routes.dbUsers.insert({name: 'x'.repeat(101), age: 30}).call();
    expect(tooLong).toBeUndefined();
    expect(tooLongError?.type).toBe('validation-error');
  });

  it('select returns the stored row with its Date revived', async () => {
    const {routes} = client();
    const [inserted] = await routes.dbUsers.insert({name: 'Diana Prince', age: 35}).call();
    const [row, routeError] = await routes.dbUsers.select(inserted!.id).call();
    expect(routeError).toBeUndefined();
    expect(row?.name).toBe('Diana Prince');
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.getTime()).toBe(inserted!.createdAt.getTime());
  });

  it('update takes a partial patch, keeps the rest, and still validates present keys', async () => {
    const {routes} = client();
    const [inserted] = await routes.dbUsers.insert({name: 'Edgar Allan', age: 40}).call();

    const [updated, updateError] = await routes.dbUsers.update(inserted!.id, {age: 41}).call();
    expect(updateError).toBeUndefined();
    expect(updated?.age).toBe(41);
    expect(updated?.name).toBe('Edgar Allan'); // untouched key kept
    expect(updated?.createdAt).toBeInstanceOf(Date);

    // an empty patch is legal (everything optional)...
    const [unchanged, emptyError] = await routes.dbUsers.update(inserted!.id, {}).call();
    expect(emptyError).toBeUndefined();
    expect(unchanged?.age).toBe(41);

    // ...but a present key still enforces the refined bound
    const [rejected, patchError] = await routes.dbUsers.update(inserted!.id, {name: 'abc'}).call();
    expect(rejected).toBeUndefined();
    expect(patchError?.type).toBe('validation-error');
  });

  it('a declared route error still flows for a missing row', async () => {
    const {routes} = client();
    const [row, routeError] = await routes.dbUsers.select('793aff46-42ac-4372-b7fa-c48ba48ed94f').call();
    expect(row).toBeUndefined();
    expect(routeError?.type).toBe('user-not-found');
  });
});

describe('drizzle-derived models over real routes, every dialect', () => {
  it('a mysql row validates its captured params and revives its Date', async () => {
    const {routes} = client();
    const registeredAt = new Date('2026-03-04T05:06:07.000Z');
    const [row, routeError] = await routes.dbDevices.insert({serialNo: 'SN-1', views: 3, registeredAt}).call();
    expect(routeError).toBeUndefined();
    expect(row?.registeredAt.getTime()).toBe(registeredAt.getTime());
    const [selected] = await routes.dbDevices.select('SN-1').call();
    expect(selected?.registeredAt).toBeInstanceOf(Date);
    // views is an unsigned int, serialNo a varchar(12)
    const [negative, negativeError] = await routes.dbDevices.insert({serialNo: 'SN-2', views: -1, registeredAt}).call();
    expect(negative).toBeUndefined();
    expect(negativeError?.type).toBe('validation-error');
    const [tooLong, tooLongError] = await routes.dbDevices.insert({serialNo: 'x'.repeat(13), views: 1, registeredAt}).call();
    expect(tooLong).toBeUndefined();
    expect(tooLongError?.type).toBe('validation-error');
  });

  it('a sqlite row validates its captured params and revives its Date', async () => {
    const {routes} = client();
    const createdAt = new Date('2026-05-06T07:08:09.000Z');
    const [row, routeError] = await routes.dbNotes.insert({title: 'first note', createdAt}).call();
    expect(routeError).toBeUndefined();
    expect(typeof row?.id).toBe('number');
    expect(row?.createdAt).toBeInstanceOf(Date);
    expect(row?.createdAt.getTime()).toBe(createdAt.getTime());
    // title is text(80)
    const [tooLong, tooLongError] = await routes.dbNotes.insert({title: 'x'.repeat(81), createdAt}).call();
    expect(tooLong).toBeUndefined();
    expect(tooLongError?.type).toBe('validation-error');
  });
});
