/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RouterOptions} from '@mionkit/router';
import {Serve} from 'bun';

export type BunServerOptions = Omit<Serve, 'fetch' | 'error'>;

export interface BunHttpOptions extends Partial<RouterOptions<Request>> {
    port: number;
    /** Bun Server Options */
    options: BunServerOptions;
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: Record<string, string>;
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: number; // default 256KB
}
