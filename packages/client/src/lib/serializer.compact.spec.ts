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

// END TO END: the test server's compact routes (objects ride as positional arrays in both directions), plus a route
// with one strategy per direction, a clone route and a compact middleFn.

function createAuthHeaders(token: string): HeadersSubset<'Authorization'> {
  return new HeadersSubset({Authorization: token});
}

describe('Compact Serialization E2E', () => {
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

  it('scalars round trip', async () => {
    const [echoed, echoError] = await routes.compact.echo('Hello Compact World!').call();
    expect(echoError).toBeUndefined();
    expect(echoed).toBe('Hello Compact World!');
    const [sum, sumError] = await routes.compact.addNumbers(10, 25).call();
    expect(sumError).toBeUndefined();
    expect(sum).toBe(35);
  });

  it('an object return comes back keyed, an object param goes out positional', async () => {
    const [user, userError] = await routes.compact.getSimpleUser('Alice', 28).call();
    expect(userError).toBeUndefined();
    expect(user).toEqual({name: 'Alice', age: 28});
    const [text, textError] = await routes.compact.processSimpleUser({name: 'Bob', age: 35}).call();
    expect(textError).toBeUndefined();
    expect(text).toBe('User: Bob, Age: 35');
  });

  it('nested objects, arrays and Dates survive both directions', async () => {
    const [created, createError] = await routes.compact.createComplexUser('u1', 'Carol', 'carol@example.com').call();
    expect(createError).toBeUndefined();
    expect(created?.createdAt).toBeInstanceOf(Date);
    expect(created?.address.city).toBe('Test City');
    expect(created?.scores).toEqual([100, 95, 88]);
    const [updated, updateError] = await routes.compact.updateComplexUser(created!).call();
    expect(updateError).toBeUndefined();
    expect(updated?.isActive).toBe(false);
    expect(updated?.tags).toEqual(['user', 'active', 'updated']);
    expect(updated?.createdAt.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    const [value, nestedError] = await routes.compact
      .processNestedData({level1: {level2: {level3: {value: 'deep', numbers: [1, 2]}}}})
      .call();
    expect(nestedError).toBeUndefined();
    expect(value).toBe('deep');
    const [later, dateError] = await routes.compact.addDays(new Date('2024-01-01T00:00:00.000Z'), 3).call();
    expect(dateError).toBeUndefined();
    expect(later?.toISOString()).toBe('2024-01-04T00:00:00.000Z');
  });

  it('an absent optional and a null return keep their meaning', async () => {
    const [greeting, greetError] = await routes.compact.greet('Dana').call();
    expect(greetError).toBeUndefined();
    expect(greeting).toBe('Hello, Dana!');
    const [nobody, findError] = await routes.compact.findUser('not-found').call();
    expect(findError).toBeUndefined();
    expect(nobody).toBeNull();
    const [somebody] = await routes.compact.findUser('u2').call();
    expect(somebody).toEqual({name: 'Found User', age: 30});
  });

  it('one strategy per direction: compact params in, a direct return out', async () => {
    const [bumped, error] = await routes.compact.mixed({name: 'Eve', age: 40}).call();
    expect(error).toBeUndefined();
    expect(bumped).toEqual({name: 'Eve', age: 41});
  });

  it('a clone route leaves the caller object untouched', async () => {
    const original = {
      id: 'u3',
      name: 'Finn',
      email: 'finn@example.com',
      age: 33,
      isActive: true,
      createdAt: new Date('2025-02-02T00:00:00.000Z'),
      address: {street: 's', city: 'c', zip: 'z', country: 'x'},
      tags: ['a'],
      scores: [1],
    };
    const [cloned, error] = await routes.compact.cloned(original).call();
    expect(error).toBeUndefined();
    expect(cloned?.tags).toEqual(['a', 'cloned']);
    expect(original.createdAt).toBeInstanceOf(Date);
    expect(original.tags).toEqual(['a']);
  });

  it('a compact middleFn rides the same wire as the route it runs with', async () => {
    const [user, error] = await routes.compact.getSimpleUser('Gus', 50).call({
      middleFns: {compactSession: middleFns.compact.session('valid-token')},
    });
    expect(error).toBeUndefined();
    expect(user).toEqual({name: 'Gus', age: 50});
  });
});
