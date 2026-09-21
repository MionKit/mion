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
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB); the platform ceiling applies on top. */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; set it when your plan or the vendor differs. */
  maxBodySizeCap?: number;
}
// type-google-cf-options-end
