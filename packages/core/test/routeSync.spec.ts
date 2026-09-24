/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {routeSyncId, type RouteSyncFields} from '../src/routeSync.ts';
import {clientRowView} from '../src/clientRowView.ts';
import type {MethodWithOptions} from '../src/types/method.types.ts';

const auth: RouteSyncFields = {id: 'auth', paramsJitHash: 'aaaaaaa', returnJitHash: 'bbbbbbb'};
const token: RouteSyncFields = {
  id: 'token',
  paramsJitHash: 'ccccccc',
  returnJitHash: 'ddddddd',
  headersParam: {jitHash: 'eeeeeee'},
};
const rows: Record<string, RouteSyncFields> = {auth, token};
const getRow = (id: string) => rows[id];
const route: RouteSyncFields = {
  id: 'users/get',
  paramsJitHash: 'fffffff',
  returnJitHash: 'ggggggg',
  middlewareIds: ['auth', 'token'],
};

describe('routeSyncId', () => {
  it('is 6 base64url chars and stable', () => {
    const id = routeSyncId(route, getRow);
    expect(id).toMatch(/^[A-Za-z0-9_-]{6}$/);
    expect(id).toBe(routeSyncId({...route}, getRow));
    expect(routeSyncId(route, getRow)).toMatchInlineSnapshot(`"BijsjB"`);
    expect(routeSyncId(auth, getRow)).toMatchInlineSnapshot(`"a4XfHA"`);
  });

  it.each([
    ['route params', {...route, paramsJitHash: 'xxxxxxx'}, getRow],
    ['route return', {...route, returnJitHash: 'xxxxxxx'}, getRow],
    ['route id', {...route, id: 'users/find'}, getRow],
    ['chain order', {...route, middlewareIds: ['token', 'auth']}, getRow],
    ['chain member removed', {...route, middlewareIds: ['auth']}, getRow],
    ['middleware params', route, (id: string) => (id === 'auth' ? {...auth, paramsJitHash: 'xxxxxxx'} : rows[id])],
    ['middleware return', route, (id: string) => (id === 'auth' ? {...auth, returnJitHash: 'xxxxxxx'} : rows[id])],
    ['headers param', route, (id: string) => (id === 'token' ? {...token, headersParam: {jitHash: 'xxxxxxx'}} : rows[id])],
  ] as [string, RouteSyncFields, (id: string) => RouteSyncFields | undefined][])(
    'changes when the %s changes',
    (_, changed, rowOf) => {
      expect(routeSyncId(changed, rowOf)).not.toBe(routeSyncId(route, getRow));
    }
  );

  it('ignores every other row field', () => {
    const withExtras = {...route, isAsync: true, paramNames: ['id'], options: {parser: 'json'}} as RouteSyncFields;
    expect(routeSyncId(withExtras, getRow)).toBe(routeSyncId(route, getRow));
  });

  it('an empty chain equals no chain', () => {
    const {middlewareIds: _, ...bare} = route;
    expect(routeSyncId({...bare, middlewareIds: []}, getRow)).toBe(routeSyncId(bare, getRow));
  });

  it('is undefined when a chain member has no row', () => {
    expect(routeSyncId({...route, middlewareIds: ['missing']}, getRow)).toBeUndefined();
  });
});

describe('clientRowView', () => {
  const row = {
    type: 1,
    id: 'users/get',
    isAsync: false,
    hasReturnData: true,
    paramsJitHash: 'p',
    returnJitHash: 'r',
    pointer: ['users', 'get'],
    nestLevel: 1,
    options: {parser: 'json', isMutation: false},
  } as unknown as MethodWithOptions;

  it('reads a single parser name as both directions, a missing paramsCount as 0 and an empty chain as absent', () => {
    const view = clientRowView({...row, middlewareIds: []});
    expect(view.parser).toEqual({params: 'json', return: 'json'});
    expect(view.paramsCount).toBe(0);
    expect(view.middlewareIds).toBeUndefined();
  });

  it('reads null as undefined and leaves out what the client never acts on', () => {
    const view = clientRowView({...row, headersParam: null, isAsync: true, paramNames: ['a']} as unknown as MethodWithOptions);
    expect(view.headersParam).toBeUndefined();
    expect(view).toEqual(clientRowView(row));
  });
});
