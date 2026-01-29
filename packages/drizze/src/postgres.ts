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
import {extractTypeInfo} from './core/typeTraverser';
import {validateConfig} from './core/validator';
import {PGColumnMapper} from './mappers/pg.mapper';
import type {PgTableConfig, PgColumnType} from './types/postgres.types';
import type {DrizzleMapperConfig} from './types/common.types';

/**
 * Merges auto-generated columns with config overrides.
 * For each property K in T:
 * - If K exists in TConfig AND TConfig[K] is a column builder, use TConfig[K]
 * - Otherwise, use the auto-generated column type
 */
type MergedPgColumns<T, TConfig> = {
    [K in keyof T as K extends string ? K : never]: K extends keyof TConfig
        ? TConfig[K] extends PgColumnBuilderBase
            ? TConfig[K] // Config property is a column builder, use it
            : PgColumnType<K & string, T[K]> // Config property is not a column builder, use auto-generated
        : PgColumnType<K & string, T[K]>; // Property not in config, use auto-generated
};

/** Default configuration for the mapper */
const DEFAULT_CONFIG: DrizzleMapperConfig = {};

/**
 * Creates a PostgreSQL table schema from a TypeScript type.
 * Auto-generates drizzle column definitions based on the type's properties.
 * Use .build(tableName, config?) to create the table with optional column overrides.
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
 * const users = mapPGTable<User>().build('users');
 *
 * // With overrides - customize specific columns
 * const users = mapPGTable<User>().build('users', {
 *   id: uuid('id').primaryKey(),
 * });
 *
 * // With custom lengthBuffer for varchar columns
 * const users = mapPGTable<User>({lengthBuffer: 2.0}).build('users');
 * ```
 */
export function mapPGTable<T>(config: DrizzleMapperConfig = DEFAULT_CONFIG, type?: ReceiveType<T>) {
    // Validate that a type parameter was provided via type reflection
    if (!type) {
        throw new TypedError({
            type: 'drizzle-table-missing-type',
            message: 'mapPGTable requires a type parameter. Usage: mapPGTable<YourType>() or mapPGTable<YourType>({config})',
        });
    }

    return {
        build<TN extends string, TConfig extends PgTableConfig<T>>(
            tableName: TN,
            tableConfig?: TConfig
        ): PgTableWithColumns<{
            name: TN;
            schema: undefined;
            columns: BuildColumns<TN, MergedPgColumns<T, TConfig>, 'pg'>;
            dialect: 'pg';
        }> {
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
                    console.warn(`mapPGTable warnings:\n${validation.warnings.join('\n')}`);
                }
            }
            // Create column mapper with config
            const mapper = new PGColumnMapper(config);
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
        },
    };
}
