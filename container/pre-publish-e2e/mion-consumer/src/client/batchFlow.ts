/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A client flow with an inline inputFrom mapper, compiled by `mion compile` (the tsc-like lane)
// and run by src/tests/compile-output.spec.ts against the server the same compile emitted. The
// mapper body is authored HERE; only the build turns it into a pure fn the server registers.
import {batch, initClient, inputFrom} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '../server/server.ts';
import {installMemoryStorage} from '../lib/memoryStorage.ts';

export async function runInlineMapperBatch(baseURL: string): Promise<{customer: unknown; prefs: unknown; errors: unknown[]}> {
    installMemoryStorage();
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})).prefill();
    const customer = routes.getCustomerById(7);
    const [[customerData, prefs], errors] = await batch([
        customer,
        routes.getPreferencesById(inputFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
    ]).call();
    return {customer: customerData, prefs, errors: [...errors]};
}
