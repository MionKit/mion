/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {createMionRouter} from '@mionjs/router';
import {startNodeServer} from '@mionjs/platform-node';
import {overrideValidate, registerFormatPattern} from '@mionjs/run-types';
import type * as TF from '@mionjs/run-types/formats';

const skuPattern = registerFormatPattern({source: '^[A-Z]{3}-[0-9]{4}$'});

// The .d.ts keeps no override call: a client gets it from the package's artifact, or its ids miss the server's.
export type Note = string & {readonly __brand: 'Note'};
overrideValidate<Note>((value): value is Note => typeof value === 'string' && value.length <= 20);

export class Product {
    constructor(
        public sku: TF.String<{pattern: typeof skuPattern}>,
        public label: string | null
    ) {}
}

const mion = createMionRouter();

// `label: string | null` makes the ids depend on strictNullChecks, which the drifted client turns off.
export const api = mion.initRoutes({
    products: {
        getBySku: mion.route((_ctx, code: TF.String<{pattern: typeof skuPattern}>): Product => new Product(code, null)),
        remove: mion.route((_ctx, code: string, note?: Note): boolean => code.length > 0 && note !== ''),
    },
});

export function startServer(port: number) {
    return startNodeServer({port});
}
