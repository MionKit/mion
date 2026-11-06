/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AppOptions} from '@mionjs/bin-uws';

export interface UwsHttpOptions {
  port: number;
  /** TLS options for uWebSockets.js' SSLApp: set means the server terminates TLS itself, omitted means plain HTTP. */
  ssl?: AppOptions;
  /** Bytes the request line and headers may take, like node's `maxHeaderSize` (8 KB). Applied when uWS first loads,
   *  through its `UWS_HTTP_MAX_HEADERS_SIZE` env var; that var, when you set it yourself, wins. */
  maxHeaderSize: number;
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB). */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; unset here, this platform has none. */
  maxBodySizeCap?: number;
}
