import {toDrizzlePGTable} from '@mionjs/drizzle';
import {uuid, text, timestamp} from 'drizzle-orm/pg-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {UUIDv7, Email} from '@ts-runtypes/core/formats';
// @annotate: Define Models using type-formats for validation and serialization functionality

interface User {
    id: UUIDv7;
    email: Email;
    name: string;
    bio?: string;
    age: number;
    createdAt: Date;
}
// @annotate: Auto-generate Drizzle table cond configure keys, indexes, etc..

const users = toDrizzlePGTable<User>('users', {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
});
// @annotate: The table schema is fully typed - columns match your interface

users.id;
