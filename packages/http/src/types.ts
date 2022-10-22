/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {IncomingMessage, ServerResponse} from 'http';
import {ServerOptions} from 'https';

export type HttpOptions = {
    protocol: 'http' | 'https';
    port: number;
    /** ServerOptions.maxHeaderSize defaults to 8KB, same as default value in new node versions */
    options: ServerOptions;
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: {[key: string]: string};
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: number; // default 256KB
    /**
     * We recommend leaving maxBodySize to an small number.
     * Instead if you have a special route or an specific use case using a large payload
     * the allowExceedMaxBodySize will be called on every new chunk of data received.
     */
    allowExceedMaxBodySize?: (currentSize: number, httpReq: IncomingMessage, httpResponse: ServerResponse) => boolean;
};
