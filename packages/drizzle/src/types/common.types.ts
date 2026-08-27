/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Compile-time assertion: instantiating with anything but `never` is a type ERROR.
 *  Used by the proxy export-completeness stub to pin that every drizzle-orm export
 *  also comes out of the matching @mionjs/drizzle proxy module. */
export type MustBeNever<T extends never> = T;
