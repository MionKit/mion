/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MySqlColumnBuilderBase} from 'drizzle-orm/mysql-core';

/**
 * Maps a TypeScript type T to a partial record of drizzle column builders.
 * Each property key must exist in T, and the value must be a MySqlColumnBuilderBase.
 */
export type MySqlTableConfig<T> = {
    [K in keyof T]?: MySqlColumnBuilderBase;
};
