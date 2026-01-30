/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mysqlTable, type MySqlTableWithColumns, type MySqlColumnBuilderBase} from 'drizzle-orm/mysql-core';
import type {BuildColumns} from 'drizzle-orm/column-builder';
import type {ReceiveType} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {extractTypeInfo} from './core/typeTraverser';
import {validateConfig} from './core/validator';
import {MySQLColumnMapper} from './mappers/mysql.mapper';
import type {MySqlTableConfig, MySqlColumnType} from './types/mysql.types';
import type {DrizzleMapperConfig} from './types/common.types';

/**
 * Merges auto-generated columns with config overrides.
 * For each property K in T:
 * - If K exists in TConfig AND TConfig[K] is a column builder, use TConfig[K]
 * - Otherwise, use the auto-generated column type
 */
type MergedMySqlColumns<T, TConfig> = {
    [K in keyof T as K extends string ? K : never]: K extends keyof TConfig
        ? TConfig[K] extends MySqlColumnBuilderBase
            ? TConfig[K] // Config property is a column builder, use it
            : MySqlColumnType<K & string, T[K]> // Config property is not a column builder, use auto-generated
        : MySqlColumnType<K & string, T[K]>; // Property not in config, use auto-generated
};

/** Default configuration for the mapper */
const DEFAULT_CONFIG: DrizzleMapperConfig = {};

/**
 * Creates a MySQL table schema from a TypeScript type.
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
 * const users = mapMySqlTable<User>().build('users');
 *
 * // With overrides - customize specific columns
 * const users = mapMySqlTable<User>().build('users', {
 *   id: varchar('id', { length: 36 }).primaryKey(),
 * });
 *
 * // With custom lengthBuffer for varchar columns
 * const users = mapMySqlTable<User>({lengthBuffer: 2.0}).build('users');
 * ```
 */
export function mapMySqlTable<T>(config: DrizzleMapperConfig = DEFAULT_CONFIG, type?: ReceiveType<T>) {
    // Validate that a type parameter was provided via type reflection
    if (!type) {
        throw new TypedError({
            type: 'drizzle-table-missing-type',
            message:
                'mapMySqlTable requires a type parameter. Usage: mapMySqlTable<YourType>() or mapMySqlTable<YourType>({config})',
        });
    }

    // Extract type information using mion's RunType system
    const typeInfo = extractTypeInfo<T>(type);

    return {
        build<TN extends string, TConfig extends MySqlTableConfig<T>>(
            tableName: TN,
            tableConfig?: TConfig
        ): MySqlTableWithColumns<{
            name: TN;
            schema: undefined;
            columns: BuildColumns<TN, MergedMySqlColumns<T, TConfig>, 'mysql'>;
            dialect: 'mysql';
        }> {
            // Validate provided config against type
            if (tableConfig) {
                const validation = validateConfig(typeInfo, tableConfig);
                if (!validation.valid) {
                    throw new TypedError({
                        type: 'drizzle-table-config-invalid',
                        message: `Cannot create MySQL table "${tableName}". The provided tableConfig does not match type "${typeInfo.typeName}":\n${validation.errors.join('\n')}`,
                    });
                }
                if (validation.warnings.length > 0) {
                    console.warn(`mapMySqlTable warnings:\n${validation.warnings.join('\n')}`);
                }
            }
            // Create column mapper with config
            const mapper = new MySQLColumnMapper(config);
            // Build columns object - all properties will be filled (either from config or auto-generated)
            type Merged = MergedMySqlColumns<T, TConfig>;
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
            // Cast is needed because mysqlTable's return type doesn't preserve the TConfig type parameter
            return mysqlTable<TN, Merged>(tableName, columns);
        },
    };
}
