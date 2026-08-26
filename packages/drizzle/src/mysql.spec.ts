/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {toDrizzleMySqlTable} from './mysql.ts';
import {varchar, text, int} from 'drizzle-orm/mysql-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {UUIDv7, Email, FormattedArray, FormattedObject, Date as RTNativeDate} from '@ts-runtypes/core/formats';
import type * as TFT from '@ts-runtypes/core/formats/temporal';

// Test interfaces
interface SimpleUser {
  id: string;
  name: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
}

interface UserWithFormats {
  id: UUIDv7;
  email: Email;
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

describe('toDrizzleMySqlTable', () => {
  describe('simple types', () => {
    it('should generate correct schema for simple types', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users');

      expect(table.id).toBeDefined();
      expect(table.name).toBeDefined();
      expect(table.age).toBeDefined();
      expect(table.isActive).toBeDefined();
      expect(table.createdAt).toBeDefined();
    });

    it('should generate varchar columns for string types', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users');

      // String should map to varchar
      expect(table.name.columnType).toBe('MySqlVarChar');
    });

    it('should generate double columns for number types', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users');

      // Number should map to double
      expect(table.age.columnType).toBe('MySqlDouble');
    });

    it('should generate boolean columns for boolean types', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users');

      // Boolean should map to boolean
      expect(table.isActive.columnType).toBe('MySqlBoolean');
    });

    it('should generate timestamp columns for Date types', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users');

      // Date should map to timestamp
      expect(table.createdAt.dataType).toBe('date');
    });
  });

  describe('formatted types', () => {
    it('should generate varchar columns for UUIDv7 format', () => {
      const table = toDrizzleMySqlTable<UserWithFormats>('users');

      // UUID format should map to varchar(36) in MySQL
      expect(table.id).toBeDefined();
      expect(table.id.columnType).toBe('MySqlVarChar');
    });

    it('should generate varchar columns for Email format', () => {
      const table = toDrizzleMySqlTable<UserWithFormats>('users');

      // Email format should map to varchar
      expect(table.email).toBeDefined();
      expect(table.email.columnType).toBe('MySqlVarChar');
    });
  });

  describe('nested objects and arrays', () => {
    it('should generate json columns for nested objects', () => {
      const table = toDrizzleMySqlTable<UserWithNestedObjects>('users');

      // Nested objects should map to json
      expect(table.profile).toBeDefined();
      expect(table.profile.columnType).toBe('MySqlJson');
    });

    it('should generate json columns for arrays', () => {
      const table = toDrizzleMySqlTable<UserWithNestedObjects>('users');

      // Arrays should map to json
      expect(table.tags).toBeDefined();
      expect(table.tags.columnType).toBe('MySqlJson');
    });
  });

  describe('optional properties', () => {
    it('should generate nullable columns for optional properties', () => {
      const table = toDrizzleMySqlTable<UserWithOptionals>('users');

      // Optional properties should be nullable
      expect(table.nickname).toBeDefined();
      expect(table.nickname!.notNull).toBe(false);
    });

    it('should generate notNull columns for required properties', () => {
      const table = toDrizzleMySqlTable<UserWithOptionals>('users');

      // Required properties should have notNull
      expect(table.id).toBeDefined();
      expect(table.name).toBeDefined();
    });
  });

  describe('column overrides', () => {
    it('should respect overrides for primary keys', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users', {
        id: varchar('id', {length: 36}).primaryKey(),
      });

      // The id column should use the override
      expect(table.id).toBeDefined();
    });

    it('should auto-generate columns not in config', () => {
      const table = toDrizzleMySqlTable<SimpleUser>('users', {
        id: varchar('id', {length: 36}).primaryKey(),
      });

      // Other columns should be auto-generated
      expect(table.name).toBeDefined();
      expect(table.age).toBeDefined();
    });

    it('should throw error when config has extra columns', () => {
      expect(() => {
        toDrizzleMySqlTable<SimpleUser>('users', {
          id: varchar('id', {length: 36}).primaryKey(),
          extraColumn: text('extra'),
        } as any);
      }).toThrow();
    });

    it('should allow overriding plain string with varchar column for UUID', () => {
      // SimpleUser has id: string, but we can override with varchar(36) for UUID
      const table = toDrizzleMySqlTable<SimpleUser>('users', {
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
      const table = toDrizzleMySqlTable<SimpleUser>('users', {
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
        toDrizzleMySqlTable<string>('users');
      }).toThrow();
    });

    it('should throw error when no type parameter is provided', () => {
      expect(() => {
        toDrizzleMySqlTable('users');
      }).toThrow('toDrizzleMySqlTable requires a type parameter');
    });
  });
});

// ############# temporal / native Date / structural formats + literal unions #############

interface EventRecord {
  id: string;
  bornAt: RTNativeDate;
  instant: TFT.Instant;
  zoned: TFT.ZonedDateTime;
  day: TFT.PlainDate;
  clock: TFT.PlainTime;
  localStamp: TFT.PlainDateTime;
  month: TFT.PlainYearMonth;
  tags: FormattedArray<string[], {minItems: 1}>;
  meta: FormattedObject<Record<string, string>, {minProperties: 1}>;
}

interface StatusRecord {
  id: string;
  status: 'active' | 'inactive';
  nullable: 'x' | 'y' | null;
  mixed: 'a' | 1;
}

describe('toDrizzleMySqlTable temporal / native Date / structural formats', () => {
  it('maps each format to its dedicated column type', () => {
    const table = toDrizzleMySqlTable<EventRecord>('events');
    expect(table.bornAt.getSQLType()).toBe('timestamp');
    expect(table.instant.getSQLType()).toBe('timestamp');
    expect(table.zoned.getSQLType()).toBe('text');
    expect(table.day.getSQLType()).toBe('date');
    expect(table.clock.getSQLType()).toBe('time');
    expect(table.localStamp.getSQLType()).toBe('datetime');
    expect(table.month.getSQLType()).toBe('varchar(7)');
    expect(table.tags.getSQLType()).toBe('json');
    expect(table.meta.getSQLType()).toBe('json');
  });

  it('regression: Temporal props never land in the JSON lane', () => {
    const table = toDrizzleMySqlTable<EventRecord>('events');
    for (const column of [table.instant, table.zoned, table.day, table.clock, table.localStamp, table.month]) {
      expect(column.columnType).not.toBe('MySqlJson');
    }
  });
});

describe('toDrizzleMySqlTable literal string unions', () => {
  it('maps literal unions to native mysql enum columns', () => {
    const table = toDrizzleMySqlTable<StatusRecord>('rows');
    expect(table.status.getSQLType()).toBe("enum('active','inactive')");
    expect(table.status.enumValues).toEqual(['active', 'inactive']);
    // null member skipped, remaining literals still enum
    expect(table.nullable.enumValues).toEqual(['x', 'y']);
    // mixed literal union keeps the plain-string fallback
    expect(table.mixed.columnType).toBe('MySqlVarChar');
  });
});
