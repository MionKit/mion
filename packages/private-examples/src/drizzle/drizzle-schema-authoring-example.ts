import * as DZ from '@mionjs/drizzle-orm-pg-core';
import {sql} from '@mionjs/drizzle-orm';

export const plan = DZ.pgEnum('plan', ['free', 'pro']);
export const invoiceSeq = DZ.pgSequence('invoice_seq', {startWith: 1000});
export const billing = DZ.pgSchema('billing');
export const reader = DZ.pgRole('reader').existing();

export const accounts = DZ.pgTable(
  'accounts',
  {
    id: DZ.uuid('id', {defaultRandom: true, primaryKey: true}),
    email: DZ.varchar('email', {length: 200, notNull: true}),
    plan: plan('plan', {notNull: true, default: ['free']}),
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

export const paidAccounts = DZ.pgView('paid_accounts', {
  id: DZ.uuid('id'),
  email: DZ.varchar('email', {length: 200, notNull: true}),
}).as(sql`select id, email from ${accounts} where plan = 'pro'`);

export const auditPolicy = DZ.pgPolicy('accounts_audit', {
  for: 'select',
  to: 'postgres',
  using: sql`true`,
}).link(accounts);
