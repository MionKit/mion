/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The client of the fetch lane: compiled with `--client-routes fetch`, so nothing about the routes is
// bundled and every call gets its metadata and compiled functions from the server's mionFetchMetadata.
import {initClient} from '@mionjs/client';
import {useFetchMetadata} from '@mionjs/client/middlewares';
import {HeadersSubset} from '@mionjs/core';
import type {TestServerApi} from '../server/server.ts';

export async function runFetchedCall(baseURL: string): Promise<{customer: unknown; error: unknown}> {
    const {routes, middlewares} = initClient<TestServerApi>({baseURL});
    useFetchMetadata(middlewares.mionFetchMetadata);
    middlewares.auth.onRequest((auth) => auth(new HeadersSubset({Authorization: 'XWYZ-TOKEN'})));
    middlewares.session.onRequest(() => undefined);
    const [customer, error] = await routes.getCustomerById(7).call();
    return {customer, error};
}
