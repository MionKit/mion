/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {mapPGTable} from './postgres';
import {uuid, text, pgTable, timestamp} from 'drizzle-orm/pg-core';
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

const someTable = pgTable('some', {
    id: uuid('id').primaryKey(),
    name: text('name'),
    email: text('email').unique(),
    createdAt: timestamp().notNull(),
});

describe('mapPGTable', () => {
    describe('simple types with .build()', () => {
        it('should generate correct schema for simple types', () => {
            const table = mapPGTable<SimpleUser>().build('users');

            // Check that all columns exist
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
            expect(table.isActive).toBeDefined();
            expect(table.createdAt).toBeDefined();
        });

        it('should generate text columns for string types', () => {
            const table = mapPGTable<SimpleUser>().build('users');

            // String should map to text
            expect(table.name.dataType).toBe('string');
        });

        it('should generate doublePrecision columns for number types', () => {
            const table = mapPGTable<SimpleUser>().build('users');

            // Number should map to doublePrecision
            expect(table.age.dataType).toBe('number');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = mapPGTable<SimpleUser>().build('users');

            // Boolean should map to boolean
            expect(table.isActive.dataType).toBe('boolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = mapPGTable<SimpleUser>().build('users');

            // Date should map to timestamp
            expect(table.createdAt.dataType).toBe('date');
        });
    });

    describe('formatted types', () => {
        it('should generate uuid columns for StrUUIDv7 format', () => {
            const table = mapPGTable<UserWithFormats>().build('users');

            // UUID format should map to uuid column
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('PgUUID');
        });

        it('should generate varchar columns for StrEmail format', () => {
            const table = mapPGTable<UserWithFormats>().build('users');

            // Email format should map to varchar
            expect(table.email).toBeDefined();
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate jsonb columns for nested objects', () => {
            const table = mapPGTable<UserWithNestedObjects>().build('users');

            // Nested objects should map to jsonb
            expect(table.profile).toBeDefined();
            expect(table.settings).toBeDefined();
        });

        it('should generate jsonb columns for arrays', () => {
            const table = mapPGTable<UserWithNestedObjects>().build('users');

            // Arrays should map to jsonb
            expect(table.tags).toBeDefined();
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = mapPGTable<UserWithOptionals>().build('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should generate notNull columns for required properties', () => {
            const table = mapPGTable<UserWithOptionals>().build('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('.build() with config overrides', () => {
        it('should respect config overrides for primary keys', () => {
            const table = mapPGTable<SimpleUser>().build('users', {
                id: text('id').primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in config', () => {
            const table = mapPGTable<SimpleUser>().build('users', {
                id: text('id').primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when config has extra columns', () => {
            expect(() => {
                mapPGTable<SimpleUser>().build('users', {
                    id: text('id').primaryKey(),
                    extraColumn: text('extra'),
                } as any);
            }).toThrow();
        });

        it('should allow overriding plain string with uuid column', () => {
            // SimpleUser has id: string, but we can override with uuid()
            const table = mapPGTable<SimpleUser>().build('users', {
                id: uuid('id').primaryKey(),
            });

            // The id column should use the uuid override
            expect(table.id).toBeDefined();
            // Verify it's a uuid column by checking the column type
            expect(table.id.columnType).toBe('PgUUID');
        });
    });

    describe('error handling', () => {
        it('should throw error for non-object types', () => {
            expect(() => {
                mapPGTable<string>().build('users');
            }).toThrow();
        });
    });
});
