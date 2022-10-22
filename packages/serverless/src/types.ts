/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ServerOptions} from 'https';

export type HttpOptions = {
    protocol: 'http' | 'https';
    port: number;
    options: ServerOptions;
    headers: {[key: string]: string};
    sameOrigin: false;
    maxBodySize: 2097152; // 2Mb
};
