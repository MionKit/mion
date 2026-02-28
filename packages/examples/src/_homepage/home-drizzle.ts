import {toDrizzlePGTable} from '@mionkit/drizzle';
import {uuid, text, timestamp} from 'drizzle-orm/pg-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {FormatUUIDv7, FormatEmail} from '@mionkit/type-formats/StringFormats';
// @annotate: Define Models using type-formats for validation and serialization functionality

interface User {
    id: FormatUUIDv7;
    email: FormatEmail;
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
