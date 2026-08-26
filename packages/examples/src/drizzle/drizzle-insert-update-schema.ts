import {createInsertSchema, createUpdateSchema} from '@mionjs/drizzle';
import {pgTable, integer, varchar, text, timestamp} from 'drizzle-orm/pg-core';

export const products = pgTable('products', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  name: varchar('name', {length: 100}).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Insert payload rules come straight from the table:
// name is required, description and createdAt are optional, id cannot be sent at all.
export const productInsert = createInsertSchema(products);
export const canInsert = productInsert.validate({name: 'Lamp'});

// Sending a generated column is caught as an unknown key
export const hasExtraKeys = productInsert.hasUnknownKeys({name: 'Lamp', id: 5});

// Update payloads accept any subset of the insert payload, including nothing
export const productUpdate = createUpdateSchema(products);
export const canUpdate = productUpdate.validate({description: 'Warm light'});
