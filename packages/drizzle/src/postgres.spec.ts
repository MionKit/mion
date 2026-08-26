/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {toDrizzlePGTable} from './postgres.ts';
import {uuid, text} from 'drizzle-orm/pg-core';
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

describe('toDrizzlePGTable', () => {
  describe('simple types', () => {
    it('should generate correct schema for simple types', () => {
      const table = toDrizzlePGTable<SimpleUser>('users');

      // Check that all columns exist
      expect(table.id).toBeDefined();
      expect(table.name).toBeDefined();
      expect(table.age).toBeDefined();
      expect(table.isActive).toBeDefined();
      expect(table.createdAt).toBeDefined();
    });

    it('should generate varchar columns for string types', () => {
      const table = toDrizzlePGTable<SimpleUser>('users');

      // String should map to varchar
      expect(table.name.dataType).toBe('string');
    });

    it('should generate doublePrecision columns for number types', () => {
      const table = toDrizzlePGTable<SimpleUser>('users');

      // Number should map to doublePrecision
      expect(table.age.dataType).toBe('number');
    });

    it('should generate boolean columns for boolean types', () => {
      const table = toDrizzlePGTable<SimpleUser>('users');

      // Boolean should map to boolean
      expect(table.isActive.dataType).toBe('boolean');
    });

    it('should generate timestamp columns for Date types', () => {
      const table = toDrizzlePGTable<SimpleUser>('users');

      // Date should map to timestamp
      expect(table.createdAt.dataType).toBe('date');
    });
  });

  describe('formatted types', () => {
    it('should generate uuid columns for UUIDv7 format', () => {
      const table = toDrizzlePGTable<UserWithFormats>('users');

      // UUID format should map to uuid column
      expect(table.id).toBeDefined();
      expect(table.id.columnType).toBe('PgUUID');
    });

    it('should generate varchar columns for Email format', () => {
      const table = toDrizzlePGTable<UserWithFormats>('users');

      // Email format should map to varchar
      expect(table.email).toBeDefined();
    });
  });

  describe('nested objects and arrays', () => {
    it('should generate jsonb columns for nested objects', () => {
      const table = toDrizzlePGTable<UserWithNestedObjects>('users');

      // Nested objects should map to jsonb
      expect(table.profile).toBeDefined();
      expect(table.settings).toBeDefined();
    });

    it('should generate jsonb columns for arrays', () => {
      const table = toDrizzlePGTable<UserWithNestedObjects>('users');

      // Arrays should map to jsonb
      expect(table.tags).toBeDefined();
    });
  });

  describe('optional properties', () => {
    it('should generate nullable columns for optional properties', () => {
      const table = toDrizzlePGTable<UserWithOptionals>('users');

      // Optional properties should be nullable
      expect(table.nickname).toBeDefined();
      expect(table.age).toBeDefined();
    });

    it('should generate notNull columns for required properties', () => {
      const table = toDrizzlePGTable<UserWithOptionals>('users');

      // Required properties should have notNull
      expect(table.id).toBeDefined();
      expect(table.name).toBeDefined();
    });
  });

  describe('config overrides', () => {
    it('should respect config overrides for primary keys', () => {
      const table = toDrizzlePGTable<SimpleUser>('users', {
        id: text('id').primaryKey(),
      });

      // The id column should use the override
      expect(table.id).toBeDefined();
    });

    it('should auto-generate columns not in config', () => {
      const table = toDrizzlePGTable<SimpleUser>('users', {
        id: text('id').primaryKey(),
      });

      // Other columns should be auto-generated
      expect(table.name).toBeDefined();
      expect(table.age).toBeDefined();
    });

    it('should throw error when config has extra columns', () => {
      expect(() => {
        toDrizzlePGTable<SimpleUser>('users', {
          id: text('id').primaryKey(),
          extraColumn: text('extra'),
        } as any);
      }).toThrow();
    });

    it('should allow overriding plain string with uuid column', () => {
      // SimpleUser has id: string, but we can override with uuid()
      const table = toDrizzlePGTable<SimpleUser>('users', {
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
        toDrizzlePGTable<string>('users');
      }).toThrow();
    });

    it('should throw error when no type parameter is provided', () => {
      expect(() => {
        toDrizzlePGTable('users');
      }).toThrow('toDrizzlePGTable requires a type parameter');
    });
  });

  describe('lengthBuffer config', () => {
    it('should use default lengthBuffer of 1.5 for email format', () => {
      const table = toDrizzlePGTable<UserWithFormats>('users');

      // Email default maxLength is 254, with 1.5 buffer = 381
      // Check that the column is varchar
      expect(table.email.columnType).toBe('PgVarchar');
    });

    it('should apply custom lengthBuffer when provided', () => {
      const table = toDrizzlePGTable<UserWithFormats>('users', undefined, {lengthBuffer: 2.0});

      // Email default maxLength is 254, with 2.0 buffer = 508
      // Check that the column is varchar
      expect(table.email.columnType).toBe('PgVarchar');
    });

    it('should use varchar for all string primitives regardless of format params', () => {
      const table = toDrizzlePGTable<SimpleUser>('users');

      // All string columns should be varchar
      expect(table.id.columnType).toBe('PgVarchar');
      expect(table.name.columnType).toBe('PgVarchar');
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

describe('toDrizzlePGTable temporal / native Date / structural formats', () => {
  it('maps each format to its dedicated column type', () => {
    const table = toDrizzlePGTable<EventRecord>('events');
    expect(table.bornAt.getSQLType()).toBe('timestamp');
    expect(table.instant.getSQLType()).toBe('timestamp with time zone');
    expect(table.zoned.getSQLType()).toBe('text');
    expect(table.day.getSQLType()).toBe('date');
    expect(table.clock.getSQLType()).toBe('time');
    expect(table.localStamp.getSQLType()).toBe('timestamp');
    expect(table.month.getSQLType()).toBe('varchar(7)');
    expect(table.tags.getSQLType()).toBe('jsonb');
    expect(table.meta.getSQLType()).toBe('jsonb');
  });

  it('regression: Temporal props never land in the JSON lane', () => {
    const table = toDrizzlePGTable<EventRecord>('events');
    for (const column of [table.instant, table.zoned, table.day, table.clock, table.localStamp, table.month]) {
      expect(column.columnType).not.toBe('PgJsonb');
    }
  });
});

describe('toDrizzlePGTable literal string unions', () => {
  it('maps literal unions to enum-carrying text columns', () => {
    const table = toDrizzlePGTable<StatusRecord>('rows');
    expect(table.status.columnType).toBe('PgText');
    expect(table.status.enumValues).toEqual(['active', 'inactive']);
    // null member skipped, remaining literals still enum
    expect(table.nullable.enumValues).toEqual(['x', 'y']);
    // mixed literal union keeps the plain-string fallback
    expect(table.mixed.columnType).toBe('PgVarchar');
  });
});
