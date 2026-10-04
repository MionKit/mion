/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// One compile generates the batch table and this mapper's module; src/tests/compile-output.spec.ts runs the result.
import {batch, initClient, inputFrom} from '@mionjs/client';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '../server/server.ts';

export async function runInlineMapperBatch(baseURL: string): Promise<{customer: unknown; prefs: unknown; errors: unknown[]}> {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
    // No session token to send, but a bundled build refuses a middleware left alone (rpc-client-optional-middleware-not-set-up).
    middlewares.session.onRequest(() => undefined);
    const customer = routes.getCustomerById(7);
    const [[customerData, customerError], [prefs, prefsError]] = await batch([
        customer,
        routes.getPreferencesById(inputFrom(customer, (customerValue) => customerValue!.preferenceId).asArg()),
    ]).call();
    return {customer: customerData, prefs, errors: [customerError, prefsError]};
}
