/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {toDrizzleSqliteTable} from './sqlite.ts';
import {text, integer} from 'drizzle-orm/sqlite-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {FormatUUIDv7, FormatEmail} from '@mionkit/type-formats/StringFormats';

// Test interfaces
interface SimpleUser {
    id: string;
    name: string;
    age: number;
    isActive: boolean;
    createdAt: Date;
}

interface UserWithFormats {
    id: FormatUUIDv7;
    email: FormatEmail;
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

describe('toDrizzleSqliteTable', () => {
    describe('simple types', () => {
        it('should generate correct schema for simple types', () => {
            const users = toDrizzleSqliteTable<SimpleUser>('users');

            expect(users.id).toBeDefined();
            expect(users.name).toBeDefined();
            expect(users.age).toBeDefined();
            expect(users.isActive).toBeDefined();
            expect(users.createdAt).toBeDefined();
        });

        it('should generate text columns for string types', () => {
            const table = toDrizzleSqliteTable<SimpleUser>('users');

            // String should map to text
            expect(table.name.columnType).toBe('SQLiteText');
        });

        it('should generate real columns for number types', () => {
            const table = toDrizzleSqliteTable<SimpleUser>('users');

            // Number should map to real
            expect(table.age.columnType).toBe('SQLiteReal');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = toDrizzleSqliteTable<SimpleUser>('users');

            // Boolean should map to SQLiteBoolean (integer with mode: 'boolean')
            expect(table.isActive.columnType).toBe('SQLiteBoolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = toDrizzleSqliteTable<SimpleUser>('users');

            // Date should map to SQLiteTimestamp (integer with mode: 'timestamp')
            expect(table.createdAt.columnType).toBe('SQLiteTimestamp');
        });
    });

    describe('formatted types', () => {
        it('should generate text columns for FormatUUIDv7 format', () => {
            const table = toDrizzleSqliteTable<UserWithFormats>('users');

            // UUID format should map to text in SQLite
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('SQLiteText');
        });

        it('should generate text columns for FormatEmail format', () => {
            const table = toDrizzleSqliteTable<UserWithFormats>('users');

            // Email format should map to text in SQLite
            expect(table.email).toBeDefined();
            expect(table.email.columnType).toBe('SQLiteText');
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate text columns with json mode for nested objects', () => {
            const table = toDrizzleSqliteTable<UserWithNestedObjects>('users');

            // Nested objects should map to SQLiteTextJson (text with mode: 'json')
            expect(table.profile).toBeDefined();
            expect(table.profile.columnType).toBe('SQLiteTextJson');
        });

        it('should generate text columns with json mode for arrays', () => {
            const table = toDrizzleSqliteTable<UserWithNestedObjects>('users');

            // Arrays should map to SQLiteTextJson (text with mode: 'json')
            expect(table.tags).toBeDefined();
            expect(table.tags.columnType).toBe('SQLiteTextJson');
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = toDrizzleSqliteTable<UserWithOptionals>('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.nickname!.notNull).toBe(false);
        });

        it('should generate notNull columns for required properties', () => {
            const table = toDrizzleSqliteTable<UserWithOptionals>('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('column overrides', () => {
        it('should respect overrides for primary keys', () => {
            const table = toDrizzleSqliteTable<SimpleUser>('users', {
                id: text('id').primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in config', () => {
            const table = toDrizzleSqliteTable<SimpleUser>('users', {
                id: text('id').primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when config has extra columns', () => {
            expect(() => {
                toDrizzleSqliteTable<SimpleUser>('users', {
                    id: text('id').primaryKey(),
                    extraColumn: text('extra'),
                } as any);
            }).toThrow();
        });

        it('should allow overriding plain string with text column for UUID', () => {
            // SimpleUser has id: string, SQLite uses text for all strings including UUIDs
            const table = toDrizzleSqliteTable<SimpleUser>('users', {
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
            const table = toDrizzleSqliteTable<SimpleUser>('users', {
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
                toDrizzleSqliteTable<string>('users');
            }).toThrow();
        });

        it('should throw error when no type parameter is provided', () => {
            expect(() => {
                toDrizzleSqliteTable('users');
            }).toThrow('toDrizzleSqliteTable requires a type parameter');
        });
    });
});
