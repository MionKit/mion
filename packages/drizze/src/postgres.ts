/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {pgTable, type PgTableWithColumns, type PgColumnBuilderBase} from 'drizzle-orm/pg-core';
import type {BuildColumns} from 'drizzle-orm/column-builder';
import type {ReceiveType} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {extractTypeInfo} from './core/typeTraverser.ts';
import {validateConfig} from './core/validator.ts';
import {PGColumnMapper} from './mappers/pg.mapper.ts';
import type {PgTableConfig, PgColumnType} from './types/postgres.types.ts';
import type {DrizzleMapperConfig, Nullable} from './types/common.types.ts';

/**
 * Merges auto-generated columns with config overrides.
 * For each property K in T:
 * - If K exists in TConfig AND TConfig[K] is a column builder, use TConfig[K]
 * - Otherwise, use the auto-generated column type (with notNull for required properties)
 */
type MergedPgColumns<T, TConfig> = {
    [K in keyof T as K extends string ? K : never]-?: K extends keyof TConfig
        ? TConfig[K] extends PgColumnBuilderBase
            ? TConfig[K]
            : Nullable<T, K, PgColumnType<K & string, NonNullable<T[K]>>>
        : Nullable<T, K, PgColumnType<K & string, NonNullable<T[K]>>>;
};

/** Default configuration for the mapper */
const DEFAULT_CONFIG: DrizzleMapperConfig = {};

/**
 * Creates a PostgreSQL table schema from a TypeScript type.
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
 * const users = toDrizzlePGTable<User>('users');
 *
 * // With overrides - customize specific columns
 * const users = toDrizzlePGTable<User>('users', {
 *   id: uuid('id').primaryKey(),
 * });
 *
 * // With custom lengthBuffer for varchar columns
 * const users = toDrizzlePGTable<User>('users', undefined, {lengthBuffer: 2.0});
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export function toDrizzlePGTable<T, TN extends string = string, TConfig extends PgTableConfig<T> = {}>(
    tableName: TN,
    tableConfig?: TConfig,
    mapperConfig: DrizzleMapperConfig = DEFAULT_CONFIG,
    type?: ReceiveType<T>
): PgTableWithColumns<{
    name: TN;
    schema: undefined;
    columns: BuildColumns<TN, MergedPgColumns<T, TConfig>, 'pg'>;
    dialect: 'pg';
}> {
    // Validate that a type parameter was provided via type reflection
    if (!type) {
        throw new TypedError({
            type: 'drizzle-table-missing-type',
            message:
                'toDrizzlePGTable requires a type parameter. Usage: toDrizzlePGTable<YourType>(tableName) or toDrizzlePGTable<YourType>(tableName, tableConfig)',
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
                message: `Cannot create PostgreSQL table "${tableName}". The provided tableConfig does not match type "${typeInfo.typeName}":\n${validation.errors.join('\n')}`,
            });
        }
        if (validation.warnings.length > 0) {
            console.warn(`toDrizzlePGTable warnings:\n${validation.warnings.join('\n')}`);
        }
    }
    // Create column mapper with config
    const mapper = new PGColumnMapper(mapperConfig);
    // Build columns object - all properties will be filled (either from config or auto-generated)
    type Merged = MergedPgColumns<T, TConfig>;
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
    // Cast is needed because pgTable's return type doesn't preserve the TConfig type parameter
    return pgTable<TN, Merged>(tableName, columns);
}
