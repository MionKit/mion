/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Calls one of the API's two routes, so the bundle holds only that one.
import {initClient} from '@mionjs/client';
import type {api} from '@acme/api';

const baseURL = (globalThis as unknown as {process: {argv: string[]}}).process.argv[2];
const {routes} = initClient<typeof api>({baseURL});
const [product, error] = await routes.products.getBySku('ABC-1234').call();
const [, invalid] = await routes.products.getBySku('not-a-sku').call();
const report = {product, error: error ?? null, invalid: invalid ? Object.keys(invalid) : null};
console.log(`<<RT>>${JSON.stringify(report)}<<RT>>`);
