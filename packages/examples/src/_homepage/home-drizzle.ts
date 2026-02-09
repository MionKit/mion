import {mapPGTable} from '@mionkit/drizzle';
import {uuid, text, timestamp} from 'drizzle-orm/pg-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {StrUUIDv7, StrEmail} from '@mionkit/type-formats/FormatsString';
// @annotate: Define Models using type-formats for validation and serialization functionality

interface User {
    id: StrUUIDv7;
    email: StrEmail;
    name: string;
    bio?: string;
    age: number;
    createdAt: Date;
}
// @annotate: Auto-generate Drizzle table cond configure keys, indexes, etc..

const users = mapPGTable<User>().build('users', {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
});
// @annotate: The table schema is fully typed - columns match your interface

users.id;
