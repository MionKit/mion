/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// A SEPARATE client project (its own tsconfig, its own program) with an inline inputFrom mapper.
// The consumer's server is compiled with `--client-tsconfig client-app/tsconfig.json`, so the
// batch table and this mapper's module are generated from THIS program into the server's gen dir;
// src/tests/compile-output.spec.ts runs the compiled flow below against the compiled server. The
// server's API type is imported type-only, the way a real client project reads its API's types;
// the tsconfig's rootDir is the consumer root so those files sit under it (tsc's rule, TS6059).
import {batch, initClient, inputFrom} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '../../src/server/server.ts';

export async function runInlineMapperBatch(baseURL: string): Promise<{customer: unknown; prefs: unknown; errors: unknown[]}> {
    const {routes, middleFns} = initClient<TestServerApi>({baseURL});
    middleFns.auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})).prefill();
    const customer = routes.getCustomerById(7);
    const [[customerData, prefs], errors] = await batch([
        customer,
        routes.getPreferencesById(inputFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
    ]).call();
    return {customer: customerData, prefs, errors: [...errors]};
}
