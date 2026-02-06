import {mapPGTable} from '@mionkit/drizzle';
import {uuid, timestamp} from 'drizzle-orm/pg-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {StrUUIDv7} from '@mionkit/type-formats/FormatsString';

/** User entity */
interface User {
    id: StrUUIDv7;
    name: string;
    createdAt: Date;
}

/** Post entity with foreign key reference */
interface Post {
    id: StrUUIDv7;
    title: string;
    content: string;
    authorId: StrUUIDv7; // Foreign key - just a string type
    createdAt: Date;
}

// @annotate: hover over `users` and `posts` to see the auto-generated Drizzle table types!
// Primary keys should be defined in the tableConfig override
export const users = mapPGTable<User>().build('users', {
    id: uuid('id').primaryKey(), // Primary key defined here
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Foreign keys should also be defined in the tableConfig override
export const posts = mapPGTable<Post>().build('posts', {
    id: uuid('id').primaryKey(), // Primary key
    authorId: uuid('author_id') // Foreign key with reference
        .references(() => users.id, {onDelete: 'cascade'})
        .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
