import {createSelectSchema} from '@mionjs/drizzle';
import {pgTable, integer, varchar, boolean} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: integer('id').primaryKey(),
  name: varchar('name', {length: 100}).notNull(),
  isActive: boolean('is_active'),
});

// One schema per table. Validators are compiled at build time by the mion plugin.
export const userSelect = createSelectSchema(users);

// Validate a full row (true / false)
export const isValid = userSelect.validate({id: 1, name: 'Ann', isActive: null});

// List what is wrong with a value
export const errors = userSelect.getErrors({id: 'nope', name: 'Ann', isActive: null});

// Generate a realistic fake row for tests (strings respect column lengths)
export const fakeRow = userSelect.mock();

// Per column checks that run after validation. Return false, or a message.
export const strictUserSelect = createSelectSchema(users, {
  name: (name) => name.trim().length > 0 || 'name cannot be blank',
});
