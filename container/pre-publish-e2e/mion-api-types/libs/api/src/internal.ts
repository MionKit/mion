/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Server-only: only a raw middleware uses it, so the types-only package must not ship it.
export interface RawSecret {
    token: string;
}
