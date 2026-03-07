/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface VercelHandlerOptions {
    /** Set of default response headers to add to every response */
    defaultResponseHeaders: Record<string, string>;
}

export interface DevServerOptions {
    port: number;
    protocol: 'http' | 'https';
}
