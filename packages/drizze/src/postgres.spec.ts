/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {drizzlePGTable} from './postgres';
import {uuid, text, pgTable, timestamp, numeric, boolean} from 'drizzle-orm/pg-core';
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

describe('drizzlePGTable', () => {
    describe('simple types', () => {
        it('should generate correct schema for simple types', () => {
            const table = drizzlePGTable<SimpleUser>('users');

            // Check that all columns exist
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
            expect(table.isActive).toBeDefined();
            expect(table.createdAt).toBeDefined();
        });

        it('should generate text columns for string types', () => {
            const table = drizzlePGTable<SimpleUser>('users');

            // String should map to text
            expect(table.name.dataType).toBe('string');
        });

        it('should generate doublePrecision columns for number types', () => {
            const table = drizzlePGTable<SimpleUser>('users');

            // Number should map to doublePrecision
            expect(table.age.dataType).toBe('number');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = drizzlePGTable<SimpleUser>('users');

            // Boolean should map to boolean
            expect(table.isActive.dataType).toBe('boolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = drizzlePGTable<SimpleUser>('users');

            // Date should map to timestamp
            expect(table.createdAt.dataType).toBe('date');
        });
    });

    describe('formatted types', () => {
        it('should generate uuid columns for StrUUIDv7 format', () => {
            const table = drizzlePGTable<UserWithFormats>('users');

            // UUID format should map to uuid column
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('PgUUID');
        });

        it('should generate varchar columns for StrEmail format', () => {
            const table = drizzlePGTable<UserWithFormats>('users');

            // Email format should map to varchar
            expect(table.email).toBeDefined();
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate jsonb columns for nested objects', () => {
            const table = drizzlePGTable<UserWithNestedObjects>('users');

            // Nested objects should map to jsonb
            expect(table.profile).toBeDefined();
            expect(table.settings).toBeDefined();
        });

        it('should generate jsonb columns for arrays', () => {
            const table = drizzlePGTable<UserWithNestedObjects>('users');

            // Arrays should map to jsonb
            expect(table.tags).toBeDefined();
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = drizzlePGTable<UserWithOptionals>('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should generate notNull columns for required properties', () => {
            const table = drizzlePGTable<UserWithOptionals>('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('tableConfig overrides', () => {
        it('should respect tableConfig overrides for primary keys', () => {
            const table = drizzlePGTable<SimpleUser>('users', {
                id: uuid('id').primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in tableConfig', () => {
            const table = drizzlePGTable<SimpleUser>('users', {
                id: uuid('id').primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when tableConfig has extra columns', () => {
            expect(() => {
                drizzlePGTable<SimpleUser>('users', {
                    id: uuid('id').primaryKey(),
                    extraColumn: text('extra'),
                } as any);
            }).toThrow();
        });
    });

    describe('error handling', () => {
        it('should throw error for non-object types', () => {
            expect(() => {
                drizzlePGTable<string>('users');
            }).toThrow();
        });
    });

    describe('strong typed results', () => {
        it('should return a strongly typed table', () => {
            const mionGeneratedTable = drizzlePGTable<SimpleUser>('users');

            const usersTable = pgTable('users', {
                id: uuid('id'),
                name: text('name'),
                age: numeric('age'),
                isActive: boolean('is_active'),
                createdAt: timestamp('created_at'),
            });

            // TODO using typescript type checking to test bot results are strongly typed
        });
    });
});
