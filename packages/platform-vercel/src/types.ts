/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export interface VercelHandlerOptions {
    /** Set of default response headers to add to every response */
    defaultResponseHeaders: Record<string, string>;
    /** Path prefix to strip from incoming URL (e.g., '/api/mion') */
    basePath: string;
}
