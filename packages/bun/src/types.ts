/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Bun serve options without fetch/error handlers (those are provided by mion) */
type BunServeOptions = Omit<Bun.Serve.BaseServeOptions<unknown>, 'error'> &
    Omit<Bun.Serve.HostnamePortServeOptions<unknown>, 'error'>;

export interface BunHttpOptions {
    port: number;
    /** Bun's native Server Options */
    options: BunServeOptions;
    /** Set of default response header to add to every response*/
    defaultResponseHeaders: Record<string, string>;
    /**
     * 256KB by default, same as lambda payload
     * @link https://docs.aws.amazon.com/lambda/latest/operatorguide/payload.html
     * */
    maxBodySize: number; // default 256KB
}
