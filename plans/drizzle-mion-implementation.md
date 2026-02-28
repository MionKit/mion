# @mionkit/drizzle - Implementation Plan

## Implementation Checklist

Each phase includes E2E tests that must pass before proceeding to the next phase. Tests should verify full functionality, not just unit-level behavior.

- [ ] **Phase 1: Core Infrastructure**
  - [ ] Create type traverser utility to walk RunType tree
  - [ ] Create base column mapper interface
  - [ ] Create validation utilities
  - [ ] Create error types and messages
  - [ ] **E2E Tests (Phase 1):**
    - [ ] Test type traverser extracts all properties from interface types
    - [ ] Test type traverser correctly identifies nested objects vs primitives
    - [ ] Test type traverser extracts format names and params from formatted types
    - [ ] Test validation utilities detect type mismatches
    - [ ] Test error messages are clear and actionable

- [ ] **Phase 2: PostgreSQL Implementation**
  - [ ] Implement PG type mappings
  - [ ] Implement PG format mappings
  - [ ] Implement drizzlePGTable function
  - [ ] **E2E Tests (Phase 2):**
    - [ ] Test drizzlePGTable generates correct schema for simple types (string, number, boolean)
    - [ ] Test drizzlePGTable generates correct schema for formatted types (FormatUUIDv7, FormatEmail, FormatInteger)
    - [ ] Test drizzlePGTable generates jsonb columns for nested objects and arrays
    - [ ] Test drizzlePGTable respects tableConfig overrides for primary keys
    - [ ] Test drizzlePGTable respects tableConfig overrides for foreign keys
    - [ ] Test drizzlePGTable handles optional properties as nullable columns
    - [ ] Test drizzlePGTable throws error when tableConfig type doesn't match TypeScript type
    - [ ] Test generated table can be used with drizzle-orm queries (insert, select, update, delete)

- [ ] **Phase 3: MySQL Implementation**
  - [ ] Implement MySQL type mappings
  - [ ] Implement MySQL format mappings
  - [ ] Implement drizzleMysqlTable function
  - [ ] **E2E Tests (Phase 3):**
    - [ ] Test drizzleMysqlTable generates correct schema for simple types
    - [ ] Test drizzleMysqlTable generates correct schema for formatted types (varchar for UUID, etc.)
    - [ ] Test drizzleMysqlTable generates json columns for nested objects and arrays
    - [ ] Test drizzleMysqlTable respects tableConfig overrides
    - [ ] Test drizzleMysqlTable handles optional properties as nullable columns
    - [ ] Test drizzleMysqlTable throws error on type mismatch
    - [ ] Test generated table can be used with drizzle-orm queries

- [ ] **Phase 4: SQLite Implementation**
  - [ ] Implement SQLite type mappings
  - [ ] Implement SQLite format mappings
  - [ ] Implement drizzleSqliteTable function
  - [ ] **E2E Tests (Phase 4):**
    - [ ] Test drizzleSqliteTable generates correct schema for simple types
    - [ ] Test drizzleSqliteTable generates text columns for formatted string types
    - [ ] Test drizzleSqliteTable generates text({mode: 'json'}) for nested objects and arrays
    - [ ] Test drizzleSqliteTable respects tableConfig overrides
    - [ ] Test drizzleSqliteTable handles optional properties as nullable columns
    - [ ] Test drizzleSqliteTable throws error on type mismatch
    - [ ] Test generated table can be used with drizzle-orm queries

- [ ] **Phase 5: TypeScript Types**
  - [ ] Create mapped types for compile-time safety
  - [ ] Add type tests using tsd or similar
  - [ ] Document type constraints
  - [ ] **E2E Tests (Phase 5):**
    - [ ] Test TypeScript compiler catches type errors when tableConfig doesn't match type
    - [ ] Test TypeScript compiler allows valid tableConfig overrides
    - [ ] Test IntelliSense provides correct suggestions for tableConfig

- [ ] **Phase 6: Documentation & Examples**
  - [ ] Add JSDoc comments
  - [ ] Create README with examples
  - [ ] Add to website documentation
  - [ ] **E2E Tests (Phase 6):**
    - [ ] Test all README examples compile and run correctly
    - [ ] Test example code in documentation is valid

## File Structure

```
packages/drizze/
├── index.ts
├── package.json
├── tsconfig.json
├── vite.config.ts
├── jest.config.js
└── src/
    ├── postgres.ts           # drizzlePGTable export
    ├── mysql.ts              # drizzleMysqlTable export
    ├── sqlite.ts             # drizzleSqliteTable export
    ├── core/
    │   ├── typeTraverser.ts  # RunType tree traversal
    │   ├── validator.ts      # Config validation
    │   ├── errors.ts         # Error types
    │   └── utils.ts          # Shared utilities
    ├── mappers/
    │   ├── base.mapper.ts    # Base mapper interface
    │   ├── pg.mapper.ts      # PostgreSQL mappings
    │   ├── mysql.mapper.ts   # MySQL mappings
    │   └── sqlite.mapper.ts  # SQLite mappings
    └── types/
        ├── common.types.ts   # Shared types
        ├── pg.types.ts       # PG-specific types
        ├── mysql.types.ts    # MySQL-specific types
        └── sqlite.types.ts   # SQLite-specific types
```

## Core Implementation Details

### 1. Type Traverser ([`typeTraverser.ts`](packages/drizze/src/core/typeTraverser.ts))

```typescript
import {runType, BaseRunType, getRunTypeFormat} from '@mionkit/run-types';
import {ReceiveType, ReflectionKind} from '@deepkit/type';
import {InterfaceRunType, PropertyRunType} from '@mionkit/run-types';
import {DrizzleMionError} from './errors';

export interface PropertyInfo {
  name: string;
  runType: BaseRunType;
  isOptional: boolean;
  isNestedObject: boolean; // Object or array - will become JSON column
  isArray: boolean; // Array type
  formatName?: string;
  formatParams?: Record<string, any>;
}

export interface TypeInfo {
  typeName: string;
  properties: PropertyInfo[];
}

/** Extracts property information from a TypeScript type using mion's RunType system */
export function extractTypeInfo<T>(type?: ReceiveType<T>): TypeInfo {
  const rt = runType(type) as BaseRunType;

  // Must be an interface/object type
  if (!(rt instanceof InterfaceRunType)) {
    throw new DrizzleMionError(`drizzle table type must be an object/interface type, got: ${rt.getKindName()}`);
  }

  const interfaceRt = rt as InterfaceRunType;
  const properties: PropertyInfo[] = [];

  // Get all property children
  const children = interfaceRt.getChildRunTypes();

  for (const child of children) {
    if (child instanceof PropertyRunType) {
      const propRt = child as PropertyRunType;
      const memberType = propRt.getMemberType() as BaseRunType;
      const kind = memberType.src.kind;

      const propInfo: PropertyInfo = {
        name: propRt.getPropertyName() as string,
        runType: memberType,
        isOptional: propRt.isOptional(),
        isNestedObject: kind === ReflectionKind.objectLiteral || kind === ReflectionKind.class,
        isArray: kind === ReflectionKind.array,
        formatName: getFormatName(memberType),
        formatParams: getFormatParams(memberType),
      };

      properties.push(propInfo);
    }
  }

  return {
    typeName: rt.getTypeName(),
    properties,
  };
}

function getFormatName(rt: BaseRunType): string | undefined {
  const format = getRunTypeFormat(rt);
  return format?.name;
}

function getFormatParams(rt: BaseRunType): Record<string, any> | undefined {
  const format = getRunTypeFormat(rt);
  if (!format) return undefined;
  return format.getParams(rt);
}
```

### 2. Base Mapper Interface ([`base.mapper.ts`](packages/drizze/src/mappers/base.mapper.ts))

```typescript
import {ReflectionKind} from '@deepkit/type';
import {BaseRunType} from '@mionkit/run-types';
import {PropertyInfo} from '../core/typeTraverser';

export interface ColumnBuilder {
  // Drizzle column builder - actual type depends on database
  notNull(): this;
  default(value: any): this;
}

export interface ColumnMapping {
  builder: ColumnBuilder;
  drizzleType: string; // For validation messages
}

export abstract class BaseColumnMapper {
  abstract mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping;
  abstract mapFormat(formatName: string, formatParams: Record<string, any>, propName: string): ColumnMapping;
  abstract mapArray(itemType: BaseRunType, propName: string): ColumnMapping;
  abstract mapObject(propName: string): ColumnMapping;

  /** Maps a property to a drizzle column */
  mapProperty(prop: PropertyInfo): ColumnMapping {
    const {runType, name, isOptional, formatName, formatParams} = prop;

    let mapping: ColumnMapping;

    // Check for format first
    if (formatName && formatParams) {
      mapping = this.mapFormat(formatName, formatParams, name);
    }
    // Check for array
    else if (runType.src.kind === ReflectionKind.array) {
      const itemType = (runType as any).getMemberType();
      mapping = this.mapArray(itemType, name);
    }
    // Check for nested object
    else if (runType.src.kind === ReflectionKind.objectLiteral || runType.src.kind === ReflectionKind.class) {
      mapping = this.mapObject(name);
    }
    // Primitive type
    else {
      mapping = this.mapPrimitive(runType.src.kind, name);
    }

    // Apply notNull for required properties
    if (!isOptional) {
      mapping.builder.notNull();
    }

    return mapping;
  }
}
```

### 3. PostgreSQL Mapper ([`pg.mapper.ts`](packages/drizze/src/mappers/pg.mapper.ts))

```typescript
import {
  text,
  integer,
  boolean,
  doublePrecision,
  bigint,
  timestamp,
  date,
  time,
  uuid,
  jsonb,
  inet,
  varchar,
} from 'drizzle-orm/pg-core';
import {ReflectionKind} from '@deepkit/type';
import {BaseColumnMapper, ColumnMapping} from './base.mapper';

export class PGColumnMapper extends BaseColumnMapper {
  mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
    switch (kind) {
      case ReflectionKind.string:
        return {builder: text(propName), drizzleType: 'text'};
      case ReflectionKind.number:
        return {builder: doublePrecision(propName), drizzleType: 'doublePrecision'};
      case ReflectionKind.boolean:
        return {builder: boolean(propName), drizzleType: 'boolean'};
      case ReflectionKind.bigint:
        return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: 'bigint'};
      default:
        throw new DrizzleMionError(`Unsupported primitive type: ${kind}`);
    }
  }

  mapFormat(formatName: string, formatParams: Record<string, any>, propName: string): ColumnMapping {
    switch (formatName) {
      case 'uuid':
        return {builder: uuid(propName), drizzleType: 'uuid'};
      case 'email':
        const emailCol = formatParams.maxLength ? varchar(propName, {length: formatParams.maxLength}) : text(propName);
        return {builder: emailCol, drizzleType: 'text/varchar'};
      case 'url':
        return {builder: text(propName), drizzleType: 'text'};
      case 'datetime':
        return {builder: timestamp(propName), drizzleType: 'timestamp'};
      case 'date':
        return {builder: date(propName), drizzleType: 'date'};
      case 'time':
        return {builder: time(propName), drizzleType: 'time'};
      case 'ip':
        return {builder: inet(propName), drizzleType: 'inet'};
      // Number formats
      case 'integer':
        return {builder: integer(propName), drizzleType: 'integer'};
      default:
        // Fall back to primitive mapping based on base type
        return this.mapPrimitive(ReflectionKind.string, propName);
    }
  }

  mapArray(itemType: any, propName: string): ColumnMapping {
    // PostgreSQL: Use jsonb for arrays
    return {builder: jsonb(propName), drizzleType: 'jsonb'};
  }

  mapObject(propName: string): ColumnMapping {
    // PostgreSQL: Use jsonb for nested objects
    return {builder: jsonb(propName), drizzleType: 'jsonb'};
  }

  mapDate(propName: string): ColumnMapping {
    return {builder: timestamp(propName), drizzleType: 'timestamp'};
  }
}
```

### 4. MySQL Mapper ([`mysql.mapper.ts`](packages/drizze/src/mappers/mysql.mapper.ts))

```typescript
import {text, int, boolean, double, bigint, timestamp, date, time, varchar, json} from 'drizzle-orm/mysql-core';
import {ReflectionKind} from '@deepkit/type';
import {BaseColumnMapper, ColumnMapping} from './base.mapper';

export class MySQLColumnMapper extends BaseColumnMapper {
  mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
    switch (kind) {
      case ReflectionKind.string:
        return {builder: text(propName), drizzleType: 'text'};
      case ReflectionKind.number:
        return {builder: double(propName), drizzleType: 'double'};
      case ReflectionKind.boolean:
        return {builder: boolean(propName), drizzleType: 'boolean'};
      case ReflectionKind.bigint:
        return {builder: bigint(propName, {mode: 'bigint'}), drizzleType: 'bigint'};
      default:
        throw new DrizzleMionError(`Unsupported primitive type: ${kind}`);
    }
  }

  mapFormat(formatName: string, formatParams: Record<string, any>, propName: string): ColumnMapping {
    switch (formatName) {
      case 'uuid':
        // MySQL doesn't have native UUID, use varchar(36)
        return {builder: varchar(propName, {length: 36}), drizzleType: 'varchar'};
      case 'email':
        const length = formatParams.maxLength || 255;
        return {builder: varchar(propName, {length}), drizzleType: 'varchar'};
      case 'url':
        return {builder: text(propName), drizzleType: 'text'};
      case 'datetime':
        return {builder: timestamp(propName), drizzleType: 'timestamp'};
      case 'date':
        return {builder: date(propName), drizzleType: 'date'};
      case 'time':
        return {builder: time(propName), drizzleType: 'time'};
      case 'ip':
        // IPv6 can be up to 45 chars
        return {builder: varchar(propName, {length: 45}), drizzleType: 'varchar'};
      case 'integer':
        return {builder: int(propName), drizzleType: 'int'};
      default:
        return this.mapPrimitive(ReflectionKind.string, propName);
    }
  }

  mapArray(itemType: any, propName: string): ColumnMapping {
    // MySQL: Use json for arrays
    return {builder: json(propName), drizzleType: 'json'};
  }

  mapObject(propName: string): ColumnMapping {
    // MySQL: Use json for nested objects
    return {builder: json(propName), drizzleType: 'json'};
  }

  mapDate(propName: string): ColumnMapping {
    return {builder: timestamp(propName), drizzleType: 'timestamp'};
  }
}
```

### 5. SQLite Mapper ([`sqlite.mapper.ts`](packages/drizze/src/mappers/sqlite.mapper.ts))

```typescript
import {text, integer, real, blob} from 'drizzle-orm/sqlite-core';
import {ReflectionKind} from '@deepkit/type';
import {BaseColumnMapper, ColumnMapping} from './base.mapper';

export class SQLiteColumnMapper extends BaseColumnMapper {
  mapPrimitive(kind: ReflectionKind, propName: string): ColumnMapping {
    switch (kind) {
      case ReflectionKind.string:
        return {builder: text(propName), drizzleType: 'text'};
      case ReflectionKind.number:
        return {builder: real(propName), drizzleType: 'real'};
      case ReflectionKind.boolean:
        return {builder: integer(propName, {mode: 'boolean'}), drizzleType: 'integer'};
      case ReflectionKind.bigint:
        return {builder: blob(propName, {mode: 'bigint'}), drizzleType: 'blob'};
      default:
        throw new DrizzleMionError(`Unsupported primitive type: ${kind}`);
    }
  }

  mapFormat(formatName: string, formatParams: Record<string, any>, propName: string): ColumnMapping {
    switch (formatName) {
      case 'uuid':
      case 'email':
      case 'url':
      case 'ip':
        // SQLite: All string formats use text
        return {builder: text(propName), drizzleType: 'text'};
      case 'datetime':
      case 'date':
      case 'time':
        // SQLite: Date/time stored as text in ISO format
        return {builder: text(propName), drizzleType: 'text'};
      case 'integer':
        return {builder: integer(propName), drizzleType: 'integer'};
      default:
        return this.mapPrimitive(ReflectionKind.string, propName);
    }
  }

  mapArray(itemType: any, propName: string): ColumnMapping {
    // SQLite: Use text with json mode for arrays
    return {builder: text(propName, {mode: 'json'}), drizzleType: 'text/json'};
  }

  mapObject(propName: string): ColumnMapping {
    // SQLite: Use text with json mode for nested objects
    return {builder: text(propName, {mode: 'json'}), drizzleType: 'text/json'};
  }

  mapDate(propName: string): ColumnMapping {
    // SQLite: Use integer for timestamps
    return {builder: integer(propName, {mode: 'timestamp'}), drizzleType: 'integer'};
  }
}
```

### 6. Validator ([`validator.ts`](packages/drizze/src/core/validator.ts))

```typescript
import {PropertyInfo} from './typeTraverser';
import {DrizzleMionError} from './errors';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/** Validates that provided table config matches the TypeScript type */
export function validateConfig(typeInfo: TypeInfo, tableConfig: Record<string, any>): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const prop of typeInfo.properties) {
    const configColumn = tableConfig[prop.name];

    if (!configColumn) {
      // Column not in config - will be auto-generated
      continue;
    }

    // Validate type compatibility
    const typeError = validateTypeCompatibility(prop, configColumn);
    if (typeError) {
      errors.push(typeError);
    }

    // Validate nullability
    const nullError = validateNullability(prop, configColumn);
    if (nullError) {
      errors.push(nullError);
    }

    // Validate format constraints
    const formatWarning = validateFormatConstraints(prop, configColumn);
    if (formatWarning) {
      warnings.push(formatWarning);
    }
  }

  // Check for extra columns in config that don't exist in type
  for (const configKey of Object.keys(tableConfig)) {
    const exists = typeInfo.properties.some((p) => p.name === configKey);
    if (!exists) {
      errors.push(`Column "${configKey}" exists in tableConfig but not in type "${typeInfo.typeName}"`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

function validateTypeCompatibility(prop: PropertyInfo, column: any): string | null {
  // Get the drizzle column type
  const columnType = getColumnType(column);
  const expectedTypes = getExpectedColumnTypes(prop);

  if (!expectedTypes.includes(columnType)) {
    return (
      `Type mismatch for property "${prop.name}": ` +
      `TypeScript type expects ${expectedTypes.join(' or ')}, ` +
      `but drizzle column is "${columnType}"`
    );
  }

  return null;
}

function validateNullability(prop: PropertyInfo, column: any): string | null {
  const isColumnNotNull = hasNotNullConstraint(column);

  if (prop.isOptional && isColumnNotNull) {
    return `Property "${prop.name}" is optional in type but column has .notNull() constraint`;
  }

  return null;
}

function validateFormatConstraints(prop: PropertyInfo, column: any): string | null {
  if (!prop.formatParams) return null;

  // Check maxLength constraint
  if (prop.formatParams.maxLength) {
    const columnLength = getColumnLength(column);
    if (columnLength && columnLength < prop.formatParams.maxLength) {
      return `Column "${prop.name}" has length ${columnLength} but type format requires maxLength ${prop.formatParams.maxLength}`;
    }
  }

  return null;
}

// Helper functions to inspect drizzle column objects
function getColumnType(column: any): string {
  // Drizzle columns have internal type info
  return column.dataType || column.columnType || 'unknown';
}

function hasNotNullConstraint(column: any): boolean {
  return column.notNull === true;
}

function getColumnLength(column: any): number | null {
  return column.length || null;
}

function getExpectedColumnTypes(prop: PropertyInfo): string[] {
  // Map TypeScript/mion types to expected drizzle column types
  const kind = prop.runType.src.kind;

  // ... mapping logic based on ReflectionKind
  return ['text', 'varchar']; // Example
}
```

### 7. Main Function ([`postgres.ts`](packages/drizze/src/postgres.ts))

```typescript
import {pgTable} from 'drizzle-orm/pg-core';
import {ReceiveType} from '@deepkit/type';
import {extractTypeInfo} from './core/typeTraverser';
import {validateConfig} from './core/validator';
import {PGColumnMapper} from './mappers/pg.mapper';
import {DrizzleMionError} from './core/errors';

export function drizzlePGTable<T>(tableName: string, tableConfig?: Record<string, any>, type?: ReceiveType<T>) {
  // Extract type information using mion's RunType system
  const typeInfo = extractTypeInfo<T>(type);

  // Validate provided config against type
  if (tableConfig) {
    const validation = validateConfig(typeInfo, tableConfig);

    if (!validation.valid) {
      throw new DrizzleMionError(`Table config validation failed:\n${validation.errors.join('\n')}`);
    }

    if (validation.warnings.length > 0) {
      console.warn(`drizzlePGTable warnings:\n${validation.warnings.join('\n')}`);
    }
  }

  // Create column mapper
  const mapper = new PGColumnMapper();

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
  return pgTable(tableName, columns);
}
```

## Nested Types and Arrays - Detailed Handling

### PostgreSQL

```typescript
// Nested object type - no annotation needed
interface UserSettings {
  theme: string;
  notifications: boolean;
}

// Main entity with arrays and nested objects
interface UserWithTags {
  id: string;
  tags: string[]; // Array of primitives -> jsonb('tags')
  scores: number[]; // Array of primitives -> jsonb('scores')
  settings: UserSettings; // Nested object -> jsonb('settings') - automatic!
}

// Usage:
const users = drizzlePGTable<UserWithTags>('users', {
  id: uuid('id').primaryKey(),
});
// Auto-generates: tags, scores, settings as jsonb columns

// The JSONB column preserves the structure and allows querying
// Example query: WHERE settings->>'theme' = 'dark'
```

### MySQL

```typescript
// Nested object type - no annotation needed
interface UserSettings {
  theme: string;
  notifications: boolean;
}

interface UserWithTags {
  id: string;
  tags: string[]; // Array of primitives -> json('tags')
  scores: number[]; // Array of primitives -> json('scores')
  settings: UserSettings; // Nested object -> json('settings') - automatic!
}

// Usage:
const users = drizzleMysqlTable<UserWithTags>('users', {
  id: varchar('id', {length: 36}).primaryKey(),
});

// MySQL JSON columns support JSON path queries
// Example query: WHERE JSON_EXTRACT(settings, '$.theme') = 'dark'
```

### SQLite

```typescript
// Nested object type - no annotation needed
interface UserSettings {
  theme: string;
  notifications: boolean;
}

interface UserWithTags {
  id: string;
  tags: string[]; // Array of primitives -> text('tags', {mode: 'json'})
  scores: number[]; // Array of primitives -> text('scores', {mode: 'json'})
  settings: UserSettings; // Nested object -> text('settings', {mode: 'json'}) - automatic!
}

// Usage:
const users = drizzleSqliteTable<UserWithTags>('users', {
  id: text('id').primaryKey(),
});

// SQLite stores as text but drizzle handles JSON serialization
// Queries use json_extract: WHERE json_extract(settings, '$.theme') = 'dark'
```

## Type Format to Drizzle Mapping - Complete Reference

All format types are imported from `@mionkit/type-formats`.

### String Formats (from `@mionkit/type-formats`)

| Format Type       | Import          | PostgreSQL                 | MySQL                    | SQLite   | Notes                          |
| ----------------- | --------------- | -------------------------- | ------------------------ | -------- | ------------------------------ |
| `string` (plain)  | N/A             | `text()`                   | `text()`                 | `text()` | Default string                 |
| `FormatString<P>`    | `StringFormats` | `text()` or `varchar(n)`   | `text()` or `varchar(n)` | `text()` | Base string format with params |
| `FormatEmail`        | `StringFormats` | `text()` or `varchar(254)` | `varchar(254)`           | `text()` | Email format                   |
| `FormatEmailStrict`  | `StringFormats` | `text()` or `varchar(254)` | `varchar(254)`           | `text()` | Strict email validation        |
| `FormatUrl`          | `StringFormats` | `text()`                   | `text()`                 | `text()` | URL format (max 2048)          |
| `FormatUrlHttp`      | `StringFormats` | `text()`                   | `text()`                 | `text()` | HTTP/HTTPS URLs only           |
| `FormatUUIDv4`       | `StringFormats` | `uuid()`                   | `varchar(36)`            | `text()` | UUID v4 format                 |
| `FormatUUIDv7`       | `StringFormats` | `uuid()`                   | `varchar(36)`            | `text()` | UUID v7 format                 |
| `FormatIP`           | `StringFormats` | `inet()`                   | `varchar(45)`            | `text()` | IP address (v4 or v6)          |
| `FormatIPv4`         | `StringFormats` | `inet()`                   | `varchar(15)`            | `text()` | IPv4 only                      |
| `FormatIPv6`         | `StringFormats` | `inet()`                   | `varchar(45)`            | `text()` | IPv6 only                      |
| `FormatDomain`       | `StringFormats` | `text()`                   | `varchar(253)`           | `text()` | Domain name                    |
| `FormatStringDateTime`     | `StringFormats` | `timestamp()`              | `datetime()`             | `text()` | ISO 8601 datetime              |
| `FormatStringDate`         | `StringFormats` | `date()`                   | `date()`                 | `text()` | ISO 8601 date                  |
| `FormatStringTime`         | `StringFormats` | `time()`                   | `time()`                 | `text()` | ISO 8601 time                  |
| `FormatAlphaNumeric` | `StringFormats` | `text()`                   | `text()`                 | `text()` | Alphanumeric only              |
| `FormatAlpha`        | `StringFormats` | `text()`                   | `text()`                 | `text()` | Letters only                   |
| `FormatNumeric`      | `StringFormats` | `text()`                   | `text()`                 | `text()` | Digits only                    |
| `FormatLowercase`    | `StringFormats` | `text()`                   | `text()`                 | `text()` | Lowercase string               |
| `FormatUppercase`    | `StringFormats` | `text()`                   | `text()`                 | `text()` | Uppercase string               |

### Number Formats (from `@mionkit/type-formats`)

| Format Type      | Import          | PostgreSQL          | MySQL        | SQLite      | Notes                          |
| ---------------- | --------------- | ------------------- | ------------ | ----------- | ------------------------------ |
| `number` (plain) | N/A             | `doublePrecision()` | `double()`   | `real()`    | Default number                 |
| `FormatNumber<P>`   | `NumberFormats` | varies              | varies       | varies      | Base number format with params |
| `FormatInteger`     | `NumberFormats` | `integer()`         | `int()`      | `integer()` | Integer constraint             |
| `FormatFloat`       | `NumberFormats` | `doublePrecision()` | `double()`   | `real()`    | Float constraint               |
| `FormatPositive`    | `NumberFormats` | `doublePrecision()` | `double()`   | `real()`    | min: 0                         |
| `FormatNegative`    | `NumberFormats` | `doublePrecision()` | `double()`   | `real()`    | max: 0                         |
| `FormatPositiveInt` | `NumberFormats` | `integer()`         | `int()`      | `integer()` | min: 0, integer                |
| `FormatNegativeInt` | `NumberFormats` | `integer()`         | `int()`      | `integer()` | max: 0, integer                |
| `FormatInt8`        | `NumberFormats` | `smallint()`        | `tinyint()`  | `integer()` | -128 to 127                    |
| `FormatInt16`       | `NumberFormats` | `smallint()`        | `smallint()` | `integer()` | -32768 to 32767                |
| `FormatInt32`       | `NumberFormats` | `integer()`         | `int()`      | `integer()` | -2147483648 to 2147483647      |
| `FormatUInt8`       | `NumberFormats` | `smallint()`        | `tinyint()`  | `integer()` | 0 to 255                       |
| `FormatUInt16`      | `NumberFormats` | `smallint()`        | `smallint()` | `integer()` | 0 to 65535                     |
| `FormatUInt32`      | `NumberFormats` | `integer()`         | `int()`      | `integer()` | 0 to 4294967295                |

### BigInt Formats (from `@mionkit/type-formats`)

| Format Type       | Import          | PostgreSQL | MySQL      | SQLite                   | Notes              |
| ----------------- | --------------- | ---------- | ---------- | ------------------------ | ------------------ |
| `bigint` (plain)  | N/A             | `bigint()` | `bigint()` | `blob({mode: 'bigint'})` | Default bigint     |
| `FormatBigInt<P>` | `BigintFormats` | `bigint()` | `bigint()` | `blob({mode: 'bigint'})` | Base bigint format |
| `FormatBigPositive`  | `BigintFormats` | `bigint()` | `bigint()` | `blob({mode: 'bigint'})` | min: 0n            |
| `FormatBigNegative`  | `BigintFormats` | `bigint()` | `bigint()` | `blob({mode: 'bigint'})` | max: 0n            |
| `FormatBigInt64`     | `BigintFormats` | `bigint()` | `bigint()` | `blob({mode: 'bigint'})` | 64-bit signed      |

### Date/Time (Native TypeScript)

| Type   | PostgreSQL    | MySQL         | SQLite                         | Notes          |
| ------ | ------------- | ------------- | ------------------------------ | -------------- |
| `Date` | `timestamp()` | `timestamp()` | `integer({mode: 'timestamp'})` | Native JS Date |

### Complex Types

| Type       | PostgreSQL | MySQL    | SQLite                 | Notes               |
| ---------- | ---------- | -------- | ---------------------- | ------------------- |
| `T[]`      | `jsonb()`  | `json()` | `text({mode: 'json'})` | Arrays as JSON      |
| `{...}`    | `jsonb()`  | `json()` | `text({mode: 'json'})` | Objects as JSON     |
| `Map<K,V>` | `jsonb()`  | `json()` | `text({mode: 'json'})` | Maps as JSON        |
| `Set<T>`   | `jsonb()`  | `json()` | `text({mode: 'json'})` | Sets as JSON arrays |

## Format Params to Drizzle Constraints

### StringParams (for `FormatString<P>`)

| Param              | Type                   | Drizzle Constraint      | Database Support | Notes                   |
| ------------------ | ---------------------- | ----------------------- | ---------------- | ----------------------- |
| `maxLength`        | `number`               | `varchar({length: n})`  | All              | Max string length       |
| `minLength`        | `number`               | Runtime validation only | N/A              | Min string length       |
| `length`           | `number`               | `char({length: n})`     | PG, MySQL        | Exact length            |
| `pattern`          | `{val: RegExp, ...}`   | Runtime validation only | N/A              | Regex pattern           |
| `allowedChars`     | `{val: string, ...}`   | Runtime validation only | N/A              | Allowed characters      |
| `disallowedChars`  | `{val: string, ...}`   | Runtime validation only | N/A              | Disallowed characters   |
| `allowedValues`    | `{val: string[], ...}` | Runtime validation only | N/A              | Enum-like values        |
| `disallowedValues` | `{val: string[], ...}` | Runtime validation only | N/A              | Disallowed values       |
| `trim`             | `boolean`              | Runtime formatting only | N/A              | Trim whitespace         |
| `lowercase`        | `boolean`              | Runtime formatting only | N/A              | Convert to lowercase    |
| `uppercase`        | `boolean`              | Runtime formatting only | N/A              | Convert to uppercase    |
| `capitalize`       | `boolean`              | Runtime formatting only | N/A              | Capitalize first letter |

### FormatParams_Number (for `FormatNumber<P>`)

| Param        | Type      | Drizzle Constraint      | Database Support | Notes                     |
| ------------ | --------- | ----------------------- | ---------------- | ------------------------- |
| `integer`    | `boolean` | Use `integer()` type    | All              | Integer constraint        |
| `float`      | `boolean` | Use `doublePrecision()` | All              | Float constraint          |
| `min`        | `number`  | Runtime validation only | N/A              | Minimum value (inclusive) |
| `max`        | `number`  | Runtime validation only | N/A              | Maximum value (inclusive) |
| `gt`         | `number`  | Runtime validation only | N/A              | Greater than (exclusive)  |
| `lt`         | `number`  | Runtime validation only | N/A              | Less than (exclusive)     |
| `multipleOf` | `number`  | Runtime validation only | N/A              | Must be multiple of value |

### FormatParams_BigInt (for `FormatBigInt<P>`)

| Param        | Type     | Drizzle Constraint      | Database Support | Notes                     |
| ------------ | -------- | ----------------------- | ---------------- | ------------------------- |
| `min`        | `bigint` | Runtime validation only | N/A              | Minimum value (inclusive) |
| `max`        | `bigint` | Runtime validation only | N/A              | Maximum value (inclusive) |
| `gt`         | `bigint` | Runtime validation only | N/A              | Greater than (exclusive)  |
| `lt`         | `bigint` | Runtime validation only | N/A              | Less than (exclusive)     |
| `multipleOf` | `bigint` | Runtime validation only | N/A              | Must be multiple of value |

## Error Messages

```typescript
// Type mismatch
"Type mismatch for property 'email': TypeScript type is 'string' but drizzle column is 'integer'";

// Missing property
"Property 'name' exists in type 'User' but not in tableConfig";

// Extra column
"Column 'extra' exists in tableConfig but not in type 'User'";

// Nullability mismatch
"Property 'bio' is optional in type but column has .notNull() constraint";

// Format constraint warning
"Column 'email' has length 100 but type format requires maxLength 255";

// Invalid type for table
"drizzle table type must be an object/interface type, got: 'array'";
```
