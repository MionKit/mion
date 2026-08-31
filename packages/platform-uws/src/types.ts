/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AppOptions} from '@mionjs/uws';
import type {BinaryOptionsPatch} from '@mionjs/core';

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
  maxBodySize: number; // default 256KB
  /**
   * Binary serialization options: buffer pooling, response-size statistics, and the mion
   * string cache. Pooling is armed by default on this platform — uWS copies the payload into its
   * own send buffer synchronously during end(), so the pooled buffer can be handed back
   * immediately after the reply is written. Turn it off with `{pool: {enabled: false}}`.
   */
  binary: BinaryOptionsPatch;
}
// type-uws-http-options-end
