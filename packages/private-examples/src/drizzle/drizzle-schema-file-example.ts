import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
import {
  accounts,
  paidAccounts,
  plan,
  invoiceSeq,
  billing,
  reader,
  auditPolicy as recordedAuditPolicy,
} from './drizzle-schema-authoring-example.ts';

// materialized for drizzle-kit

export const accountsTable = toDrizzle(accounts);
export const paidAccountsView = toDrizzle(paidAccounts);

export const planEnum = toDrizzle(plan);
export const invoiceSequence = toDrizzle(invoiceSeq);
export const billingSchema = toDrizzle(billing);
export const readerRole = toDrizzle(reader);

export const auditPolicy = toDrizzle(recordedAuditPolicy);
