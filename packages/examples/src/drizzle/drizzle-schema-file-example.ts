import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {sql} from '@mionjs/drizzle-orm';

// declared with the slim packages, no drizzle types

export const plan = DZ.pgEnum('plan', ['free', 'pro']);
export const invoiceSeq = DZ.pgSequence('invoice_seq', {startWith: 1000});
export const billing = DZ.pgSchema('billing');
export const reader = DZ.pgRole('reader').existing();

const accounts = DZ.pgTable(
  'accounts',
  {
    id: DZ.uuid('id').defaultRandom().primaryKey(),
    email: DZ.varchar('email', {length: 200}).notNull(),
    plan: plan('plan').notNull().default('free'),
    spend: DZ.numeric('spend', {precision: 10, scale: 2, mode: 'number'}),
  },
  (t) => [
    DZ.uniqueIndex('accounts_email_uidx').on(t.email),
    DZ.check('accounts_spend_check', sql`${t.spend} >= 0`),
    DZ.pgPolicy('accounts_reader', {
      for: 'select',
      to: reader,
      using: sql`true`,
    }),
  ]
).enableRLS();

const paidAccounts = DZ.pgView('paid_accounts', {
  id: DZ.uuid('id'),
  email: DZ.varchar('email', {length: 200}).notNull(),
}).as(sql`select id, email from ${accounts} where plan = 'pro'`);

// materialized for drizzle-kit

export const accountsTable = toDrizzle(accounts);
export const paidAccountsView = toDrizzle(paidAccounts);

export const planEnum = toDrizzle(plan);
export const invoiceSequence = toDrizzle(invoiceSeq);
export const billingSchema = toDrizzle(billing);
export const readerRole = toDrizzle(reader);

export const auditPolicy = toDrizzle(
  DZ.pgPolicy('accounts_audit', {
    for: 'select',
    to: 'postgres',
    using: sql`true`,
  }).link(accounts)
);
