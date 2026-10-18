/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {HttpRequest} from '@mionjs/bin-uws';
import {headersFromUwsRequest} from '../src/headers.ts';

const fakeRequest = (pairs: [string, string][]): HttpRequest =>
  ({forEach: (visit: (name: string, value: string) => void) => pairs.forEach(([name, value]) => visit(name, value))}) as any;

describe('headersFromUwsRequest', () => {
  it('reads a header named like an Object.prototype member as sent', () => {
    const headers = headersFromUwsRequest(fakeRequest([['constructor', 'a']]));
    expect(headers.get('constructor')).toBe('a');
  });

  it('still joins a repeated header', () => {
    const headers = headersFromUwsRequest(
      fakeRequest([
        ['constructor', 'a'],
        ['x-a', '1'],
        ['constructor', 'b'],
        ['x-a', '2'],
      ])
    );
    expect(headers.get('constructor')).toBe('a, b');
    expect(headers.get('x-a')).toBe('1, 2');
  });
});
