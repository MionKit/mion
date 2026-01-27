<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png">
    <img alt='mion, Typescript Full Stack APIs' src='https://raw.githubusercontent.com/MionKit/mion/master/assets/public/bannerx90.png'>
  </picture>
</p>
<p align="center">
  <strong>Auto-generate Drizzle ORM table schemas from TypeScript types
  </strong>
</p>
<p align=center>

  <img src="https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
  <img src="https://img.shields.io/badge/license-MIT-97ca00.svg?style=flat-square&maxAge=99999999" alt="npm"  style="max-width:100%;">
</p>

# `@mionkit/drizzle`

🚀 Auto-generate Drizzle ORM table schemas from TypeScript types using mion's runtime type system.

Unlike `drizzle-zod` which generates Zod schemas FROM drizzle tables, this package works in the **opposite direction**: it auto-generates drizzle table configurations FROM TypeScript types while allowing optional overrides.

## Features

- **Auto-generate table schemas** from TypeScript types
- **Support for all three databases**: PostgreSQL, MySQL, and SQLite
- **Format-aware mappings**: Uses `@mionkit/type-formats` for intelligent column type selection
- **Override support**: Customize primary keys, foreign keys, and constraints
- **Validation**: Validates config overrides match TypeScript types

## Installation

```bash
npm install @mionkit/drizzle drizzle-orm
```

## Quick Start

### PostgreSQL

```typescript
import {drizzlePGTable} from '@mionkit/drizzle';
import {uuid} from 'drizzle-orm/pg-core';
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';

interface User {
  id: StrUUIDv7;
  email: StrEmail;
  name: string;
  bio?: string; // Optional = nullable
  tags: string[]; // Array = jsonb
  metadata: {theme: string}; // Nested object = jsonb
  createdAt: Date;
}

// Only specify primary key - rest is auto-generated
export const users = drizzlePGTable<User>('users', {
  id: uuid('id').primaryKey(),
});

// Auto-generates:
// - email: text('email').notNull()
// - name: text('name').notNull()
// - bio: text('bio')  (nullable because optional)
// - tags: jsonb('tags').notNull()
// - metadata: jsonb('metadata').notNull()
// - createdAt: timestamp('createdAt').notNull()
```

### MySQL

```typescript
import {drizzleMysqlTable} from '@mionkit/drizzle';
import {varchar} from 'drizzle-orm/mysql-core';
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';

interface User {
  id: StrUUIDv7;
  email: StrEmail;
  name: string;
}

export const users = drizzleMysqlTable<User>('users', {
  id: varchar('id', {length: 36}).primaryKey(),
});
```

### SQLite

```typescript
import {drizzleSqliteTable} from '@mionkit/drizzle';
import {text} from 'drizzle-orm/sqlite-core';
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';

interface User {
  id: StrUUIDv7;
  email: StrEmail;
  name: string;
}

export const users = drizzleSqliteTable<User>('users', {
  id: text('id').primaryKey(),
});
```

## Type Mappings

### Primitive Types

| TypeScript Type | PostgreSQL          | MySQL         | SQLite                         |
| --------------- | ------------------- | ------------- | ------------------------------ |
| `string`        | `text()`            | `text()`      | `text()`                       |
| `number`        | `doublePrecision()` | `double()`    | `real()`                       |
| `boolean`       | `boolean()`         | `boolean()`   | `integer({mode: 'boolean'})`   |
| `bigint`        | `bigint()`          | `bigint()`    | `blob({mode: 'bigint'})`       |
| `Date`          | `timestamp()`       | `timestamp()` | `integer({mode: 'timestamp'})` |

### Format Types (from `@mionkit/type-formats`)

| Format Type   | PostgreSQL    | MySQL          | SQLite      |
| ------------- | ------------- | -------------- | ----------- |
| `StrUUIDv7`   | `uuid()`      | `varchar(36)`  | `text()`    |
| `StrEmail`    | `text()`      | `varchar(254)` | `text()`    |
| `StrIP`       | `inet()`      | `varchar(45)`  | `text()`    |
| `StrDateTime` | `timestamp()` | `datetime()`   | `text()`    |
| `NumInteger`  | `integer()`   | `int()`        | `integer()` |

### Complex Types

| TypeScript Type  | PostgreSQL | MySQL    | SQLite                 |
| ---------------- | ---------- | -------- | ---------------------- |
| `T[]` (array)    | `jsonb()`  | `json()` | `text({mode: 'json'})` |
| `{...}` (object) | `jsonb()`  | `json()` | `text({mode: 'json'})` |
| `T?` (optional)  | nullable   | nullable | nullable               |

## Foreign Keys

Foreign keys are defined in the tableConfig, similar to primary keys:

```typescript
interface Post {
  id: string;
  title: string;
  authorId: string; // Foreign key - just a string type
}

export const posts = drizzlePGTable<Post>('posts', {
  id: uuid('id').primaryKey(),
  authorId: uuid('author_id').references(() => users.id, {onDelete: 'cascade'}),
});
```

## Validation

The package validates that your tableConfig matches the TypeScript type:

```typescript
interface User {
  id: string;
  name: string;
}

// ❌ Error: Column "email" exists in tableConfig but not in type "User"
const users = drizzlePGTable<User>('users', {
  id: uuid('id').primaryKey(),
  email: text('email'), // This property doesn't exist in User!
});
```

## Important Notes

### Import Format Types Correctly

When using format types from `@mionkit/type-formats`, you must use **regular imports** (not `import type`) for the runtime type metadata to be preserved:

```typescript
// ✅ Correct - regular import preserves metadata
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';

// ❌ Wrong - type import strips metadata
import type {StrUUIDv7, StrEmail} from '@mionkit/type-formats';
```

### Nested Objects vs Foreign Keys

Nested objects are stored as JSON. Use foreign key IDs for entity references:

```typescript
// ✅ Good: Profile is a value object - stored as JSON
interface User {
  id: string;
  profile: {bio: string; avatar: string};
}

// ❌ Bad: Don't embed entire entities
interface Book {
  id: string;
  owner: User; // This stores the entire User as JSON!
}

// ✅ Good: Use foreign key ID instead
interface Book {
  id: string;
  ownerId: string; // Reference by ID
}
```

## Check Out The [Website And Documentation](http://mion.io) 📚

[![mion-website-banner](https://raw.githubusercontent.com/MionKit/mion/master/assets/public/mion-website-banner.png)](http://mion.io)

---

## &nbsp;

_[MIT](../../LICENSE) LICENSE_
