/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {existsSync, readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initClient} from './client.ts';
import {batch} from './batch.ts';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '@mionjs/test-server';
import {TEST_SERVER_BASE_URL} from '../globalSetup.ts';

// The whole point of dropping the child-process server mode: client and API are ONE program now.
// This package's own build is the batch source (it pulls the API entry in through the `source`
// export condition), so the table lands under THIS package's genDir and the API — started in the
// same process by globalSetup — answers the batches that table holds.
//
// The other specs would pass on a two-process setup too; these two would not.

const GEN_DIR = resolve(import.meta.dirname, '../.mion');

describe('one program: client and API share this build', () => {
  it('writes the batch transport under THIS package genDir, not the API package', () => {
    const table = resolve(GEN_DIR, 'rpc', 'batches.generated.js');
    expect(existsSync(table)).toBe(true);
    expect(readFileSync(table, 'utf8')).toContain('replaceBatches');
    // No batch transport is written into the API's package: this program is the batch source, and
    // the API is a plain source dependency of it. (middlewareMode.e2e.spec.ts does put a `types/`
    // tree there, from the vite server it builds around that package's OWN tsconfig.)
    expect(existsSync(resolve(import.meta.dirname, '../../test-server/.mion/rpc'))).toBe(false);
  });

  it('round-trips a batch against the in-process server', async () => {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL: TEST_SERVER_BASE_URL});
    middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})).prefill();
    const [[age, sum], [ageError, sumError], fatal] = await batch([routes.calculateAge(1990), routes.utils.sumTwo(5)]).call();
    expect(fatal).toBeUndefined();
    expect(ageError).toBeUndefined();
    expect(sumError).toBeUndefined();
    expect(age).toEqual(new Date().getFullYear() - 1990);
    expect(sum).toEqual(7);
  });
});
