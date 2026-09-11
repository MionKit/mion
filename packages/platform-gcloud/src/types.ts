/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// type-google-cf-options-start
export interface GoogleCFOptions {
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /** The request limit a route takes when its own `maxBodySize` option is unset and its types cannot
   *  say, in bytes (128 KB by default). A route's option always wins over it; the platform's own
   *  request ceiling still applies on top. */
  maxBodySize: number;
  /** The platform's own request ceiling in bytes, which no other option can raise: the router never
   *  resolves a limit above it. Defaults to the platform's documented ceiling; set it by hand when your plan allows
   *  more or the vendor changes it. */
  maxBodySizeCap?: number;
}
// type-google-cf-options-end
