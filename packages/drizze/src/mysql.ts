/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mysqlTable} from 'drizzle-orm/mysql-core';
import type {ReceiveType} from '@deepkit/type';
import {TypedError} from '@mionkit/core';
import {extractTypeInfo} from './core/typeTraverser';
import {validateConfig} from './core/validator';
import {MySQLColumnMapper} from './mappers/mysql.mapper';
import type {MySqlTableConfig} from './types/mysql.types';

/**
 * Creates a MySQL table schema from a TypeScript type.
 * Auto-generates drizzle column definitions based on the type's properties.
 * Allows overriding specific columns via tableConfig (e.g., for primary keys, foreign keys).
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
 * const users = drizzleMysqlTable<User>('users', {
 *   id: varchar('id', { length: 36 }).primaryKey(),
 * });
 * ```
 */
export function drizzleMysqlTable<T, TConfig extends MySqlTableConfig<T> = MySqlTableConfig<T>>(
    tableName: string,
    tableConfig?: TConfig,
    type?: ReceiveType<T>
) {
    // Extract type information using mion's RunType system
    const typeInfo = extractTypeInfo<T>(type);
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
            console.warn(`drizzleMysqlTable warnings:\n${validation.warnings.join('\n')}`);
        }
    }
    // Create column mapper
    const mapper = new MySQLColumnMapper();
    // Build columns object
    const columns: Record<string, any> = {};
    for (const prop of typeInfo.properties) {
        // Use provided config if available, otherwise auto-generate
        if (tableConfig && tableConfig[prop.name]) {
            columns[prop.name] = tableConfig[prop.name];
        } else {
            const mapping = mapper.mapProperty(prop);
            columns[prop.name] = mapping.builder;
        }
    }
    // Create and return the drizzle table
    return mysqlTable(tableName, columns);
}
