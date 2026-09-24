/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {clientRowView} from '../src/clientRowView.ts';
import type {MethodWithOptions} from '../src/types/method.types.ts';

describe('clientRowView', () => {
  const row = {
    type: 1,
    id: 'users/get',
    isAsync: false,
    hasReturnData: true,
    paramsJitHash: 'p',
    returnJitHash: 'r',
    syncId: 's',
    pointer: ['users', 'get'],
    nestLevel: 1,
    options: {parser: 'json', isMutation: false},
  } as unknown as MethodWithOptions;

  it('reads a single parser name as both directions, a missing paramsCount as 0 and an empty chain as absent', () => {
    const view = clientRowView({...row, middlewareIds: []});
    expect(view.parser).toEqual({params: 'json', return: 'json'});
    expect(view.paramsCount).toBe(0);
    expect(view.middlewareIds).toBeUndefined();
    expect(view.syncId).toBe('s');
  });

  it('reads null as undefined and leaves out what the client never acts on', () => {
    const view = clientRowView({...row, headersParam: null, isAsync: true, paramNames: ['a']} as unknown as MethodWithOptions);
    expect(view.headersParam).toBeUndefined();
    expect(view).toEqual(clientRowView(row));
  });
});
