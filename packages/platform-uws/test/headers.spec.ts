/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import type {HttpRequest} from '@mionjs/bin-uws';
import {bufferedResponseHeaders, forEachHeader, headersFromUwsRequest} from '../src/headers.ts';

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

describe('bufferedResponseHeaders', () => {
  const written = (headers: ReturnType<typeof bufferedResponseHeaders>) => {
    const lines: [string, string][] = [];
    forEachHeader(headers, (name, value) => lines.push([name, value]));
    return lines;
  };

  it('keeps each appended set-cookie as its own line, reads them joined', () => {
    const headers = bufferedResponseHeaders(null);
    headers.append('Set-Cookie', 'a=1');
    headers.append('set-cookie', 'b=2');
    headers.append('set-cookie', 'c=3');
    expect(written(headers)).toEqual([
      ['set-cookie', 'a=1'],
      ['set-cookie', 'b=2'],
      ['set-cookie', 'c=3'],
    ]);
    expect(headers.get('set-cookie')).toBe('a=1, b=2, c=3');
    expect([...headers.entries()]).toEqual([['set-cookie', 'a=1, b=2, c=3']]);
    expect([...headers.values()]).toEqual(['a=1, b=2, c=3']);
  });

  it('still joins any other repeated name with a comma', () => {
    const headers = bufferedResponseHeaders(null);
    headers.append('x-a', '1');
    headers.append('x-a', '2');
    expect(written(headers)).toEqual([['x-a', '1, 2']]);
  });

  it('appends to a header named like an Object.prototype member as if it were new', () => {
    const headers = bufferedResponseHeaders(null);
    headers.append('constructor', 'a');
    expect(headers.get('constructor')).toBe('a');
    expect(headers.has('toString')).toBe(false);
  });
});
