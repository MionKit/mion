/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Serve} from 'bun';

export interface BunHttpOptions {
    port: number;
    /** Bun Server Options */
    options: Omit<Serve, 'fetch' | 'error'>;
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: Record<string, string>;
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: number; // default 256KB
}
