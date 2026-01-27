/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {drizzleMysqlTable} from './mysql';
import {varchar, text} from 'drizzle-orm/mysql-core';
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

describe('drizzleMysqlTable', () => {
    describe('simple types', () => {
        it('should generate correct schema for simple types', () => {
            const table = drizzleMysqlTable<SimpleUser>('users');

            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
            expect(table.isActive).toBeDefined();
            expect(table.createdAt).toBeDefined();
        });

        it('should generate text columns for string types', () => {
            const table = drizzleMysqlTable<SimpleUser>('users');

            // String should map to text
            expect(table.name.columnType).toBe('MySqlText');
        });

        it('should generate double columns for number types', () => {
            const table = drizzleMysqlTable<SimpleUser>('users');

            // Number should map to double
            expect(table.age.columnType).toBe('MySqlDouble');
        });

        it('should generate boolean columns for boolean types', () => {
            const table = drizzleMysqlTable<SimpleUser>('users');

            // Boolean should map to boolean
            expect(table.isActive.columnType).toBe('MySqlBoolean');
        });

        it('should generate timestamp columns for Date types', () => {
            const table = drizzleMysqlTable<SimpleUser>('users');

            // Date should map to timestamp
            expect(table.createdAt.dataType).toBe('date');
        });
    });

    describe('formatted types', () => {
        it('should generate varchar columns for StrUUIDv7 format', () => {
            const table = drizzleMysqlTable<UserWithFormats>('users');

            // UUID format should map to varchar(36) in MySQL
            expect(table.id).toBeDefined();
            expect(table.id.columnType).toBe('MySqlVarChar');
        });

        it('should generate varchar columns for StrEmail format', () => {
            const table = drizzleMysqlTable<UserWithFormats>('users');

            // Email format should map to varchar
            expect(table.email).toBeDefined();
            expect(table.email.columnType).toBe('MySqlVarChar');
        });
    });

    describe('nested objects and arrays', () => {
        it('should generate json columns for nested objects', () => {
            const table = drizzleMysqlTable<UserWithNestedObjects>('users');

            // Nested objects should map to json
            expect(table.profile).toBeDefined();
            expect(table.profile.columnType).toBe('MySqlJson');
        });

        it('should generate json columns for arrays', () => {
            const table = drizzleMysqlTable<UserWithNestedObjects>('users');

            // Arrays should map to json
            expect(table.tags).toBeDefined();
            expect(table.tags.columnType).toBe('MySqlJson');
        });
    });

    describe('optional properties', () => {
        it('should generate nullable columns for optional properties', () => {
            const table = drizzleMysqlTable<UserWithOptionals>('users');

            // Optional properties should be nullable
            expect(table.nickname).toBeDefined();
            expect(table.nickname.notNull).toBe(false);
        });

        it('should generate notNull columns for required properties', () => {
            const table = drizzleMysqlTable<UserWithOptionals>('users');

            // Required properties should have notNull
            expect(table.id).toBeDefined();
            expect(table.name).toBeDefined();
        });
    });

    describe('tableConfig overrides', () => {
        it('should respect tableConfig overrides for primary keys', () => {
            const table = drizzleMysqlTable<SimpleUser>('users', {
                id: varchar('id', {length: 36}).primaryKey(),
            });

            // The id column should use the override
            expect(table.id).toBeDefined();
        });

        it('should auto-generate columns not in tableConfig', () => {
            const table = drizzleMysqlTable<SimpleUser>('users', {
                id: varchar('id', {length: 36}).primaryKey(),
            });

            // Other columns should be auto-generated
            expect(table.name).toBeDefined();
            expect(table.age).toBeDefined();
        });

        it('should throw error when tableConfig has extra columns', () => {
            expect(() => {
                drizzleMysqlTable<SimpleUser>('users', {
                    id: varchar('id', {length: 36}).primaryKey(),
                    extraColumn: text('extra'),
                });
            }).toThrow();
        });
    });

    describe('error handling', () => {
        it('should throw error for non-object types', () => {
            expect(() => {
                drizzleMysqlTable<string>('users');
            }).toThrow();
        });
    });
});
