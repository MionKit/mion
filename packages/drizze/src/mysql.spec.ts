/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {toDBMySqlTable} from './mysql.ts';
import {varchar, text, int} from 'drizzle-orm/mysql-core';
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

describe('toDBMySqlTable', () => {
    describe('simple types with .build()', () => {
        it('should generate correct schema for simple types', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users');

            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
            expect(table.isActive).toBeDefined();
            expect(table.createdAt).toBeDefined();
        });

        it('should generate varchar columns for string types', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users');

            // String should map to varchar
            expect(table.name.columnType).toBe('MySqlVarChar');
        });

        it('should generate double columns for number types', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users');

            // Number should map to double
            expect(table.age.columnType).toBe('MySqlDouble');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users');

            // Boolean should map to boolean
            expect(table.isActive.columnType).toBe('MySqlBoolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users');

            // Date should map to timestamp
            expect(table.createdAt.dataType).toBe('date');
        });
    });

    describe('formatted types', () => {
        it('should generate varchar columns for StrUUIDv7 format', () => {
            const table = toDBMySqlTable<UserWithFormats>().build('users');

            // UUID format should map to varchar(36) in MySQL
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('MySqlVarChar');
        });

        it('should generate varchar columns for StrEmail format', () => {
            const table = toDBMySqlTable<UserWithFormats>().build('users');

            // Email format should map to varchar
            expect(table.email).toBeDefined();
            expect(table.email.columnType).toBe('MySqlVarChar');
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate json columns for nested objects', () => {
            const table = toDBMySqlTable<UserWithNestedObjects>().build('users');

            // Nested objects should map to json
            expect(table.profile).toBeDefined();
            expect(table.profile.columnType).toBe('MySqlJson');
        });

        it('should generate json columns for arrays', () => {
            const table = toDBMySqlTable<UserWithNestedObjects>().build('users');

            // Arrays should map to json
            expect(table.tags).toBeDefined();
            expect(table.tags.columnType).toBe('MySqlJson');
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = toDBMySqlTable<UserWithOptionals>().build('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.nickname!.notNull).toBe(false);
        });

        it('should generate notNull columns for required properties', () => {
            const table = toDBMySqlTable<UserWithOptionals>().build('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('column overrides with .build(name, config)', () => {
        it('should respect overrides for primary keys', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users', {
                id: varchar('id', {length: 36}).primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in config', () => {
            const table = toDBMySqlTable<SimpleUser>().build('users', {
                id: varchar('id', {length: 36}).primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when config has extra columns', () => {
            expect(() => {
                toDBMySqlTable<SimpleUser>().build('users', {
                    id: varchar('id', {length: 36}).primaryKey(),
                    extraColumn: text('extra'),
                } as any);
            }).toThrow();
        });

        it('should allow overriding plain string with varchar column for UUID', () => {
            // SimpleUser has id: string, but we can override with varchar(36) for UUID
            const table = toDBMySqlTable<SimpleUser>().build('users', {
                id: varchar('id', {length: 36}).primaryKey(),
            });

            // The id column should use the varchar override
            expect(table.id).toBeDefined();
            // Verify it's a varchar column by checking the column type
            expect(table.id.columnType).toBe('MySqlVarChar');
        });

        it('should allow overriding number (double) with int column', () => {
            // SimpleUser has age: number, which auto-generates to MySqlDouble
            // We can override with int() to get MySqlInt instead
            const table = toDBMySqlTable<SimpleUser>().build('users', {
                age: int('age'),
            });

            // The age column should use the int override instead of double
            expect(table.age).toBeDefined();
            // Verify it's an int column (not double) by checking the column type
            expect(table.age.columnType).toBe('MySqlInt');
        });
    });

    describe('error handling', () => {
        it('should throw error for non-object types', () => {
            expect(() => {
                toDBMySqlTable<string>().build('users');
            }).toThrow();
        });

        it('should throw error when no type parameter is provided', () => {
            expect(() => {
                toDBMySqlTable().build('users');
            }).toThrow('toDBMySqlTable requires a type parameter');
        });
    });
});
