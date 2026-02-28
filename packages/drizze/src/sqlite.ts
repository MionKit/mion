/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {sqliteTable, type SQLiteTableWithColumns, type SQLiteColumnBuilderBase} from 'drizzle-orm/sqlite-core';
import type {BuildColumns} from 'drizzle-orm/column-builder';
import type {ReceiveType} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {extractTypeInfo} from './core/typeTraverser.ts';
import {validateConfig} from './core/validator.ts';
import {SQLiteColumnMapper} from './mappers/sqlite.mapper.ts';
import type {SqliteTableConfig, SqliteColumnType} from './types/sqlite.types.ts';
import type {DrizzleMapperConfig, Nullable} from './types/common.types.ts';

/**
 * Merges auto-generated columns with config overrides.
 * For each property K in T:
 * - If K exists in TConfig AND TConfig[K] is a column builder, use TConfig[K]
 * - Otherwise, use the auto-generated column type (with notNull for required properties)
 */
type MergedSqliteColumns<T, TConfig> = {
    [K in keyof T as K extends string ? K : never]-?: K extends keyof TConfig
        ? TConfig[K] extends SQLiteColumnBuilderBase
            ? TConfig[K]
            : Nullable<T, K, SqliteColumnType<K & string, NonNullable<T[K]>>>
        : Nullable<T, K, SqliteColumnType<K & string, NonNullable<T[K]>>>;
};

/** Default configuration for the mapper */
const DEFAULT_CONFIG: DrizzleMapperConfig = {};

/**
 * Creates a SQLite table schema from a TypeScript type.
 * Auto-generates drizzle column definitions based on the type's properties.
 *
 * @example
 * ```typescript
 * interface User {
 *   id: StrUUIDv7;
 *   email: StrEmail;
 *   name: string;
 *   age: number;
 *   createdAt: Date;
 * }
 *
 * // Without overrides - auto-generates all columns
 * const users = toDrizzleSqliteTable<User>('users');
 *
 * // With overrides - customize specific columns
 * const users = toDrizzleSqliteTable<User>('users', {
 *   id: text('id').primaryKey(),
 * });
 *
 * // With custom lengthBuffer (not used for SQLite text columns, but for consistency)
 * const users = toDrizzleSqliteTable<User>('users', undefined, {lengthBuffer: 2.0});
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function toDrizzleSqliteTable<T, TN extends string = string, TConfig extends SqliteTableConfig<T> = {}>(
    tableName: TN,
    tableConfig?: TConfig,
    mapperConfig: DrizzleMapperConfig = DEFAULT_CONFIG,
    type?: ReceiveType<T>
): SQLiteTableWithColumns<{
    name: TN;
    schema: undefined;
    columns: BuildColumns<TN, MergedSqliteColumns<T, TConfig>, 'sqlite'>;
    dialect: 'sqlite';
}> {
    // Validate that a type parameter was provided via type reflection
    if (!type) {
        throw new TypedError({
            type: 'drizzle-table-missing-type',
            message:
                'toDrizzleSqliteTable requires a type parameter. Usage: toDrizzleSqliteTable<YourType>(tableName) or toDrizzleSqliteTable<YourType>(tableName, tableConfig)',
        });
    }

    // Extract type information using mion's RunType system
    const typeInfo = extractTypeInfo<T>(type);

    // Validate provided config against type
    if (tableConfig) {
        const validation = validateConfig(typeInfo, tableConfig);
        if (!validation.valid) {
            throw new TypedError({
                type: 'drizzle-table-config-invalid',
                message: `Cannot create SQLite table "${tableName}". The provided tableConfig does not match type "${typeInfo.typeName}":\n${validation.errors.join('\n')}`,
            });
        }
        if (validation.warnings.length > 0) {
            console.warn(`toDrizzleSqliteTable warnings:\n${validation.warnings.join('\n')}`);
        }
    }
    // Create column mapper with config
    const mapper = new SQLiteColumnMapper(mapperConfig);
    // Build columns object - all properties will be filled (either from config or auto-generated)
    type Merged = MergedSqliteColumns<T, TConfig>;
    const columns: Merged = {} as Merged;
    for (const prop of typeInfo.properties) {
        // Use provided config if available, otherwise auto-generate
        const configKey = prop.name as keyof TConfig;
        if (tableConfig && configKey in tableConfig) {
            (columns as Record<string, unknown>)[prop.name] = tableConfig[configKey];
        } else {
            const mapping = mapper.mapProperty(prop);
            (columns as Record<string, unknown>)[prop.name] = mapping.builder;
        }
    }
    // Create and return the drizzle table
    // Cast is needed because sqliteTable's return type doesn't preserve the TConfig type parameter
    return sqliteTable<TN, Merged>(tableName, columns);
}
