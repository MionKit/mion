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
  /**
   * TLS options passed to uWebSockets.js' SSLApp (key_file_name, cert_file_name, ...).
   * When set the server terminates TLS itself; when omitted it serves plain HTTP.
   */
  ssl?: AppOptions;
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /**
   * 256KB by default, same as lambda payload
   * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
   * */
  /** The request limit a route takes when its own option is unset and its types cannot say (128 KB by
   *  default). A route's `maxBodySize` option always wins over it. */
  maxBodySize: number;
  /** The platform's own request ceiling in bytes, which no other option can raise; unset because this
   *  platform has none. The router never resolves a limit above it when set. */
  maxBodySizeCap?: number;
}
// type-uws-http-options-end
