/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The fetching twin of client/src/main.ts: built with routes 'fetch', so it asks the server for each route's metadata.
import {initClient} from '@mionjs/client';
import {useFetchMetadata} from '@mionjs/client/middlewares';
import type {api} from '@acme/api';

const baseURL = (globalThis as unknown as {process: {argv: string[]}}).process.argv[2];
const {routes, middlewares} = initClient<typeof api>({baseURL});
useFetchMetadata(middlewares.mionFetchMetadata);
const [product, error] = await routes.products.getBySku('ABC-1234').call();
const [, invalid] = await routes.products.getBySku('not-a-sku').call();
const report = {product, error: error ?? null, invalid: invalid ? Object.keys(invalid) : null};
console.log(`<<RT>>${JSON.stringify(report)}<<RT>>`);
