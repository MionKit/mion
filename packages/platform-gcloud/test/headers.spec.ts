/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {IncomingMessage, ServerResponse} from 'http';
import {Socket} from 'net';
import {headersFromServerResponse} from '../src/headers.ts';

describe('headersFromServerResponse', () => {
  it('writes every default but content-type: a raw middleware ending the response sends its own', () => {
    const resp = new ServerResponse(new IncomingMessage(new Socket()));
    headersFromServerResponse(resp, {server: 'mionjs', 'x-team': 'mion', 'content-type': 'application/json; charset=utf-8'});
    expect(resp.getHeaders()).toEqual({server: 'mionjs', 'x-team': 'mion'});
  });
});
