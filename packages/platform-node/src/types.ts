/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ServerOptions} from 'https';

// type-node-http-options-start
export interface NodeHttpOptions {
  protocol: 'http' | 'https';
  port: number;
  /** Native node's ServerOptions. By default maxHeaderSize defaults to 8KB, same as in latest node versions */
  options: ServerOptions;
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB). */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; unset here, this platform has none. */
  maxBodySizeCap?: number;
  /** The HOST owns the socket: no `listen()` and no SIGINT/SIGTERM handlers; mount `httpRequestHandler` yourself.
   *  `mionVitePlugin({server: {startScript}})` sets this for you. */
  asMiddleware: boolean;
}
// type-node-http-options-end
