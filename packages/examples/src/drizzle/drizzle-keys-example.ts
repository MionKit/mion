import {toDrizzlePGTable} from '@mionjs/drizzle';
import {uuid, timestamp} from 'drizzle-orm/pg-core';
// Note: Must use regular import (not `import type`) for reflection to work
import {UUIDv7} from '@ts-runtypes/core/formats';

/** User entity */
interface User {
    id: UUIDv7;
    name: string;
    createdAt: Date;
}

/** Post entity with foreign key reference */
interface Post {
    id: UUIDv7;
    title: string;
    content: string;
    authorId: UUIDv7; // Foreign key - just a string type
    createdAt: Date;
}

// Primary keys should be defined in the tableConfig override
export const users = toDrizzlePGTable<User>('users', {
    id: uuid('id').primaryKey(), // Primary key defined here
    createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Foreign keys should also be defined in the tableConfig override
export const posts = toDrizzlePGTable<Post>('posts', {
    id: uuid('id').primaryKey(), // Primary key
    authorId: uuid('author_id') // Foreign key with reference
        .references(() => users.id, {onDelete: 'cascade'})
        .notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
});
