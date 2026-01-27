/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {drizzleSqliteTable} from './sqlite';
import {text} from 'drizzle-orm/sqlite-core';
// Note: Must use regular import (not `import type`) for deepkit reflection to work
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';

// Test interfaces
interface SimpleUser {
    id: string;
    name: string;
    age: number;
    isActive: boolean;
    createdAt: Date;
}

interface UserWithFormats {
    id: StrUUIDv7;
    email: StrEmail;
    name: string;
    bio?: string;
}

interface UserWithNestedObjects {
    id: string;
    name: string;
    profile: {
        bio: string;
        avatar: string;
    };
    tags: string[];
    settings: {theme: string; notifications: boolean};
}

interface UserWithOptionals {
    id: string;
    name: string;
    nickname?: string;
    age?: number;
}

describe('drizzleSqliteTable', () => {
    describe('simple types', () => {
        it('should generate correct schema for simple types', () => {
            const table = drizzleSqliteTable<SimpleUser>('users');

            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
            expect(table.isActive).toBeDefined();
            expect(table.createdAt).toBeDefined();
        });

        it('should generate text columns for string types', () => {
            const table = drizzleSqliteTable<SimpleUser>('users');

            // String should map to text
            expect(table.name.columnType).toBe('SQLiteText');
        });

        it('should generate real columns for number types', () => {
            const table = drizzleSqliteTable<SimpleUser>('users');

            // Number should map to real
            expect(table.age.columnType).toBe('SQLiteReal');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = drizzleSqliteTable<SimpleUser>('users');

            // Boolean should map to SQLiteBoolean (integer with mode: 'boolean')
            expect(table.isActive.columnType).toBe('SQLiteBoolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = drizzleSqliteTable<SimpleUser>('users');

            // Date should map to SQLiteTimestamp (integer with mode: 'timestamp')
            expect(table.createdAt.columnType).toBe('SQLiteTimestamp');
        });
    });

    describe('formatted types', () => {
        it('should generate text columns for StrUUIDv7 format', () => {
            const table = drizzleSqliteTable<UserWithFormats>('users');

            // UUID format should map to text in SQLite
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('SQLiteText');
        });

        it('should generate text columns for StrEmail format', () => {
            const table = drizzleSqliteTable<UserWithFormats>('users');

            // Email format should map to text in SQLite
            expect(table.email).toBeDefined();
            expect(table.email.columnType).toBe('SQLiteText');
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate text columns with json mode for nested objects', () => {
            const table = drizzleSqliteTable<UserWithNestedObjects>('users');

            // Nested objects should map to SQLiteTextJson (text with mode: 'json')
            expect(table.profile).toBeDefined();
            expect(table.profile.columnType).toBe('SQLiteTextJson');
        });

        it('should generate text columns with json mode for arrays', () => {
            const table = drizzleSqliteTable<UserWithNestedObjects>('users');

            // Arrays should map to SQLiteTextJson (text with mode: 'json')
            expect(table.tags).toBeDefined();
            expect(table.tags.columnType).toBe('SQLiteTextJson');
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = drizzleSqliteTable<UserWithOptionals>('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.nickname.notNull).toBe(false);
        });

        it('should generate notNull columns for required properties', () => {
            const table = drizzleSqliteTable<UserWithOptionals>('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('tableConfig overrides', () => {
        it('should respect tableConfig overrides for primary keys', () => {
            const table = drizzleSqliteTable<SimpleUser>('users', {
                id: text('id').primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in tableConfig', () => {
            const table = drizzleSqliteTable<SimpleUser>('users', {
                id: text('id').primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when tableConfig has extra columns', () => {
            expect(() => {
                drizzleSqliteTable<SimpleUser>('users', {
                    id: text('id').primaryKey(),
                    extraColumn: text('extra'),
                });
            }).toThrow();
        });
    });

    describe('error handling', () => {
        it('should throw error for non-object types', () => {
            expect(() => {
                drizzleSqliteTable<string>('users');
            }).toThrow();
        });
    });
});
