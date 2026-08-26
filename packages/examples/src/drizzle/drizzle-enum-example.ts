import {createEnumSchema, createSelectSchema} from '@mionjs/drizzle';
import {pgEnum, pgTable, integer, text} from 'drizzle-orm/pg-core';

export const moodEnum = pgEnum('mood', ['happy', 'ok', 'sad']);

export const posts = pgTable('posts', {
  id: integer('id').primaryKey(),
  mood: moodEnum('mood').notNull(),
  status: text('status', {enum: ['draft', 'published']}).notNull(),
});

// A database enum validates as its value union
export const moodSchema = createEnumSchema(moodEnum);
export const isMood = moodSchema.validate('happy');

// Enum columns are enforced by the row schema too, with no extra setup
export const postSelect = createSelectSchema(posts);
export const statusErrors = postSelect.getErrors({id: 1, mood: 'happy', status: 'archived'});
