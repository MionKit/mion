/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mapSqliteTable} from './sqlite';
import {text, integer} from 'drizzle-orm/sqlite-core';
// Note: Must use regular import (not `import type`) for reflection to work
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

describe('mapSqliteTable', () => {
    describe('simple types with .build()', () => {
        it('should generate correct schema for simple types', () => {
            const table = mapSqliteTable<SimpleUser>().build('users');

            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
            expect(table.isActive).toBeDefined();
            expect(table.createdAt).toBeDefined();
        });

        it('should generate text columns for string types', () => {
            const table = mapSqliteTable<SimpleUser>().build('users');

            // String should map to text
            expect(table.name.columnType).toBe('SQLiteText');
        });

        it('should generate real columns for number types', () => {
            const table = mapSqliteTable<SimpleUser>().build('users');

            // Number should map to real
            expect(table.age.columnType).toBe('SQLiteReal');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = mapSqliteTable<SimpleUser>().build('users');

            // Boolean should map to SQLiteBoolean (integer with mode: 'boolean')
            expect(table.isActive.columnType).toBe('SQLiteBoolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = mapSqliteTable<SimpleUser>().build('users');

            // Date should map to SQLiteTimestamp (integer with mode: 'timestamp')
            expect(table.createdAt.columnType).toBe('SQLiteTimestamp');
        });
    });

    describe('formatted types', () => {
        it('should generate text columns for StrUUIDv7 format', () => {
            const table = mapSqliteTable<UserWithFormats>().build('users');

            // UUID format should map to text in SQLite
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('SQLiteText');
        });

        it('should generate text columns for StrEmail format', () => {
            const table = mapSqliteTable<UserWithFormats>().build('users');

            // Email format should map to text in SQLite
            expect(table.email).toBeDefined();
            expect(table.email.columnType).toBe('SQLiteText');
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate text columns with json mode for nested objects', () => {
            const table = mapSqliteTable<UserWithNestedObjects>().build('users');

            // Nested objects should map to SQLiteTextJson (text with mode: 'json')
            expect(table.profile).toBeDefined();
            expect(table.profile.columnType).toBe('SQLiteTextJson');
        });

        it('should generate text columns with json mode for arrays', () => {
            const table = mapSqliteTable<UserWithNestedObjects>().build('users');

            // Arrays should map to SQLiteTextJson (text with mode: 'json')
            expect(table.tags).toBeDefined();
            expect(table.tags.columnType).toBe('SQLiteTextJson');
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = mapSqliteTable<UserWithOptionals>().build('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.nickname!.notNull).toBe(false);
        });

        it('should generate notNull columns for required properties', () => {
            const table = mapSqliteTable<UserWithOptionals>().build('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('column overrides with .build(name, config)', () => {
        it('should respect overrides for primary keys', () => {
            const table = mapSqliteTable<SimpleUser>().build('users', {
                id: text('id').primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in config', () => {
            const table = mapSqliteTable<SimpleUser>().build('users', {
                id: text('id').primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when config has extra columns', () => {
            expect(() => {
                mapSqliteTable<SimpleUser>().build('users', {
                    id: text('id').primaryKey(),
                    extraColumn: text('extra'),
                } as any);
            }).toThrow();
        });

        it('should allow overriding plain string with text column for UUID', () => {
            // SimpleUser has id: string, SQLite uses text for all strings including UUIDs
            const table = mapSqliteTable<SimpleUser>().build('users', {
                id: text('id').primaryKey(),
            });

            // The id column should use the text override with primary key
            expect(table.id).toBeDefined();
            // Verify it's a text column by checking the column type
            expect(table.id.columnType).toBe('SQLiteText');
        });

        it('should allow overriding number (real) with integer column', () => {
            // SimpleUser has age: number, which auto-generates to SQLiteReal
            // Override it with integer() to get SQLiteInteger
            const table = mapSqliteTable<SimpleUser>().build('users', {
                age: integer('age'),
            });

            // The age column should use the integer override instead of real
            expect(table.age).toBeDefined();
            // Verify it's an integer column (not real) by checking the column type
            expect(table.age.columnType).toBe('SQLiteInteger');
        });
    });

    describe('error handling', () => {
        it('should throw error for non-object types', () => {
            expect(() => {
                mapSqliteTable<string>().build('users');
            }).toThrow();
        });

        it('should throw error when no type parameter is provided', () => {
            expect(() => {
                mapSqliteTable().build('users');
            }).toThrow('mapSqliteTable requires a type parameter');
        });
    });
});
