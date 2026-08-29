// The drizzle-kit schema file: the one place everything you declared becomes
// real drizzle objects. Point drizzle.config.ts at this file. Every export
// here is materialized, and anything you forget to export is invisible to your
// migrations, which is the only rule to remember.
import * as DB from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {sql} from '@mionjs/drizzle-orm';
import {pgView} from '@mionjs/drizzle-orm-pg-core';

// ── declared with the slim surface, no drizzle types anywhere ────────────────

export const plan = DB.pgEnum('plan', ['free', 'pro']);
export const invoiceSeq = DB.pgSequence('invoice_seq', {startWith: 1000});
export const billing = DB.pgSchema('billing');
export const reader = DB.pgRole('reader').existing();

const accounts = DB.pgTable(
  'accounts',
  {
    id: DB.uuid('id').defaultRandom().primaryKey(),
    email: DB.varchar('email', {length: 200}).notNull(),
    plan: plan('plan').notNull().default('free'),
    spend: DB.numeric('spend', {precision: 10, scale: 2, mode: 'number'}),
  },
  (t) => [
    DB.uniqueIndex('accounts_email_uidx').on(t.email),
    DB.check('accounts_spend_check', sql`${t.spend} >= 0`),
    DB.pgPolicy('accounts_reader', {for: 'select', to: reader, using: sql`true`}),
  ]
).enableRLS();

const paidAccounts = pgView('paid_accounts', {
  id: DB.uuid('id'),
  email: DB.varchar('email', {length: 200}).notNull(),
}).as(sql`select id, email from ${accounts} where plan = 'pro'`);

// ── materialized for drizzle-kit ─────────────────────────────────────────────

// Tables and views.
export const accountsTable = toDrizzle(accounts);
export const paidAccountsView = toDrizzle(paidAccounts);

// The standalone handles. An enum, a sequence, a schema and a role are objects
// drizzle-kit reads on their own, so each one needs its own toDrizzle call.
export const planEnum = toDrizzle(plan);
export const invoiceSequence = toDrizzle(invoiceSeq);
export const billingSchema = toDrizzle(billing);
export const readerRole = toDrizzle(reader);

// A policy attached with link() sits in no table's third argument, so it is
// materialized here too. Policies declared inline (like accounts_reader above)
// come along with their table and need nothing extra.
export const auditPolicy = toDrizzle(
  DB.pgPolicy('accounts_audit', {for: 'select', to: 'postgres', using: sql`true`}).link(accounts)
);
