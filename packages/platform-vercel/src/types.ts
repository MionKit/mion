/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// type-vercel-handler-options-start
export interface VercelHandlerOptions {
  /** Set of default response headers to add to every response */
  defaultResponseHeaders: Record<string, string>;
  /** Bytes a route takes when its own `maxBodySize` and its types say nothing (128 KB); the platform ceiling applies on top. */
  maxBodySize: number;
  /** The platform's request ceiling in bytes that no option can raise; set it when your plan or the vendor differs. */
  maxBodySizeCap?: number;
}
// type-vercel-handler-options-end

export interface DevServerOptions {
  port: number;
  protocol: 'http' | 'https';
}
