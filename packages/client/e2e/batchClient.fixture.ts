/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A client flow with an inline inputFrom mapper, compiled by the batch transport's end-to-end
// suite (packages/devtools/test/e2e) through BOTH lanes, vite and `mion compile`, and run against
// the test server each lane built. Not a test itself and not part of the shipped client: it lives
// in this package so the server build reads it as part of the client program (`client.tsConfig`).
import {HeadersSubset} from '@mionjs/core';
import {batch, initClient, inputFrom} from '../index.ts';
import type {TestServerApi} from '@mionjs/test-server';

export interface BatchRun {
  customer: unknown;
  prefs: unknown;
  errors: unknown[];
}

/** Runs the customer → preferences batch: the second route's input is mapped server-side from the
 *  first route's output by the inline arrow below, which only the build turns into a pure fn. */
export async function runBatch(baseURL: string): Promise<BatchRun> {
  const {routes, middleFns} = initClient<TestServerApi>({baseURL});
  const customer = routes.getCustomerById(7);
  const [[customerData, prefs], errors] = await batch([
    customer,
    routes.getPreferencesById(inputFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
  ]).call({middleFns: {auth: middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'}))}});
  return {customer: customerData, prefs, errors: [...errors]};
}
