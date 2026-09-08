/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, afterEach} from 'vitest';
import {initClient} from '../client.ts';
import {HeadersSubset} from '@mionjs/core';
import {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../../globalSetup.ts';

// End to end over the test server's compact routes: the client takes each route's strategy from the
// shipped metadata, then encodes and decodes on the positional wire, first call included.

function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
}

describe('Compact encoder E2E', () => {
  type MyApi = TestServerApi;
  const baseURL = TEST_SERVER_BASE_URL;
  const authHeaders = createAuthHeaders('XWYZ-TOKEN');
  const {routes, middleFns} = initClient<MyApi>({baseURL});

  beforeEach(() => {
    middleFns.auth(authHeaders).prefill();
  });

  afterEach(async () => {
    await middleFns.auth(authHeaders).removePrefill();
  });

  it('scalars ride unchanged', async () => {
    const [echoed, echoError] = await routes.compact.echo('Hello Compact').call();
    expect(echoError).toBeUndefined();
    expect(echoed).toBe('Hello Compact');
    const [sum, sumError] = await routes.compact.addNumbers(20, 22).call();
    expect(sumError).toBeUndefined();
    expect(sum).toBe(42);
  });

  it('an object comes back keyed although the wire is positional', async () => {
    const [user, error] = await routes.compact.getSimpleUser('Ada', 36).call();
    expect(error).toBeUndefined();
    expect(user).toEqual({name: 'Ada', age: 36});
  });

  it('an object param is encoded positionally and restored on the server', async () => {
    const [text, error] = await routes.compact.processSimpleUser({name: 'Ada', age: 36}).call();
    expect(error).toBeUndefined();
    expect(text).toBe('User: Ada, Age: 36');
  });

  it('nested objects, dates and arrays round-trip both directions', async () => {
    const [user, error] = await routes.compact.getComplexUser('u-1').call();
    expect(error).toBeUndefined();
    expect(user?.createdAt).toBeInstanceOf(Date);
    expect(user?.createdAt.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    expect(user?.address).toEqual({street: '123 Main St', city: 'Springfield', zip: '12345', country: 'US'});
    expect(user?.scores).toEqual([95, 87, 92]);
    const [back, backError] = await routes.compact.processComplexUser(user!).call();
    expect(backError).toBeUndefined();
    expect(back).toEqual({...user!, name: 'COMPACT USER'});
    const [nested, nestedError] = await routes.compact
      .processNested({level1: {level2: {level3: {value: 'deep', numbers: [1, 2, 3]}}}})
      .call();
    expect(nestedError).toBeUndefined();
    expect(nested).toEqual({level1: {level2: {level3: {value: 'DEEP', numbers: [2, 4, 6]}}}});
  });

  it('a Date param and a Date return keep their type', async () => {
    const [date, error] = await routes.compact.addDays(new Date('2024-01-01T00:00:00.000Z'), 10).call();
    expect(error).toBeUndefined();
    expect(date).toBeInstanceOf(Date);
    expect(date?.toISOString()).toBe('2024-01-11T00:00:00.000Z');
  });

  it('an absent optional property and an absent optional param come back undefined', async () => {
    const event = {title: 'Launch', at: new Date('2024-03-03T03:03:03.000Z'), attendees: [{name: 'Ada', age: 36}]};
    const [described, error] = await routes.compact.describeEvent(event).call();
    expect(error).toBeUndefined();
    expect(described).toEqual(event);
    expect(described).not.toHaveProperty('place');
    const [noted, notedError] = await routes.compact
      .describeEvent({...event, place: {street: 's', city: 'c', zip: 'z', country: 'x'}}, 'vip')
      .call();
    expect(notedError).toBeUndefined();
    expect(noted?.title).toBe('Launch (vip)');
    expect(noted?.place?.city).toBe('c');
  });

  it('a route mixing compact params with a direct return works', async () => {
    const [user, error] = await routes.compact.mixed({name: 'Ada', age: 36}).call();
    expect(error).toBeUndefined();
    expect(user).toEqual({name: 'Ada', age: 37});
  });

  it('a clone route answers as usual', async () => {
    const [user, error] = await routes.compact.cloned({name: 'Ada', age: 36}).call();
    expect(error).toBeUndefined();
    expect(user).toEqual({name: 'Ada', age: 36});
  });

  it('a compact middleFn in the chain takes and returns data on the compact wire', async () => {
    const [user, error, , middleFnResults] = await routes.compact.getSimpleUser('Ada', 36).call({
      middleFns: {auth: middleFns.auth(authHeaders), stamp: middleFns.compact.stamp('release')},
    });
    expect(error).toBeUndefined();
    expect(user).toEqual({name: 'Ada', age: 36});
    expect(middleFnResults?.stamp?.tag).toBe('release');
    expect(middleFnResults?.stamp?.when).toBeInstanceOf(Date);
  });
});
