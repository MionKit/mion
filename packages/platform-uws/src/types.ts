/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AppOptions} from '@mionjs/bin-uws';

// type-uws-http-options-start
export interface UwsHttpOptions {
  port: number;
  /** TLS options for uWebSockets.js' SSLApp: set means the server terminates TLS itself, omitted means plain HTTP. */
  ssl?: AppOptions;
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB). */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; unset here, this platform has none. */
  maxBodySizeCap?: number;
}
// type-uws-http-options-end
