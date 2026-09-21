/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Bun serve options without the error handler, which mion provides */
type BunServeOptions = Omit<Bun.Serve.BaseServeOptions<unknown>, 'error'> &
  Omit<Bun.Serve.HostnamePortServeOptions<unknown>, 'error'>;

// type-bun-http-options-start
export interface BunHttpOptions {
  port: number;
  /** Bun's native Server Options */
  options: BunServeOptions;
  /** Set of default response header to add to every response*/
  defaultResponseHeaders: Record<string, string>;
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB). */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; unset here, this platform has none. */
  maxBodySizeCap?: number;
  /** The HOST owns the socket: no `Bun.serve()` and no SIGINT/SIGTERM handlers; mount `bunRequestHandler` yourself.
   *  `mionVitePlugin({server: {startScript, platform: '@mionjs/platform-bun'}})` sets this for you. */
  asMiddleware: boolean;
}
// type-bun-http-options-end
