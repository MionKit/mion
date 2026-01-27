/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {sqliteTable} from 'drizzle-orm/sqlite-core';
import type {ReceiveType} from '@deepkit/type';
import {extractTypeInfo} from './core/typeTraverser';
import {validateConfig} from './core/validator';
import {SQLiteColumnMapper} from './mappers/sqlite.mapper';
import {DrizzleMionError} from './core/errors';

/**
 * Creates a SQLite table schema from a TypeScript type.
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
 * const users = drizzleSqliteTable<User>('users', {
 *   id: text('id').primaryKey(),
 * });
 * ```
 */
export function drizzleSqliteTable<T>(tableName: string, tableConfig?: Record<string, any>, type?: ReceiveType<T>) {
    // Extract type information using mion's RunType system
    const typeInfo = extractTypeInfo<T>(type);
    // Validate provided config against type
    if (tableConfig) {
        const validation = validateConfig(typeInfo, tableConfig);
        if (!validation.valid) {
            throw new DrizzleMionError(`Table config validation failed:\n${validation.errors.join('\n')}`);
        }
        if (validation.warnings.length > 0) {
            console.warn(`drizzleSqliteTable warnings:\n${validation.warnings.join('\n')}`);
        }
    }
    // Create column mapper
    const mapper = new SQLiteColumnMapper();
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
    return sqliteTable(tableName, columns);
}
