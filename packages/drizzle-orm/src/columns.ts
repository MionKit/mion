/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// The runtime half of the column vocabulary: sentinel keys, `$type` and the modifier list (types in ./types.ts).

/** Sentinel key of the column spec. */
export const rtColSpecKey: unique symbol = Symbol('rtColSpec');
/** Type-only key of a named builder result's db name, lifted by the table into its names map. */
export declare const rtColNameKey: unique symbol;
/** Type-only key of a named builder result's column. */
export declare const rtNamedColumnKey: unique symbol;

/** `$type<T>()` in a builder's props: drizzle's `.$type<T>()`, recorded as `{$type: [T]}`. Type-only. */
export function $type<T>(): [T] {
  return [] as unknown as [T];
}

/** Sentinel key of the literal sql carrier (Sql<'now()'>). */
export const rtSqlTextKey: unique symbol = Symbol('rtSqlText');

// ── Modifiers ────────────────────────────────────────────────────────────────
// Props mix config and modifiers: varchar('n', {length: 100, notNull: true}) is Varchar<{length: 100; notNull: true}>.
// A modifier's args are a TUPLE, so `default: [true]` stays apart from a flag.
// Every reader splits by colModNames: ./columnRecorder.ts, ./fromType.ts, ts-go-runtypes/internal/convert/drizzle.go.
// colMods.spec.ts gates the list against the dialect manifests and every config key.

/** Every modifier method name a column type can carry, across all dialects. */
export const colModNames = [
  '$default',
  '$defaultFn',
  '$onUpdate',
  '$onUpdateFn',
  '$type',
  'array',
  'autoincrement',
  'default',
  'defaultNow',
  'defaultRandom',
  'generatedAlwaysAs',
  'generatedAlwaysAsIdentity',
  'generatedByDefaultAsIdentity',
  'notNull',
  'onUpdateNow',
  'primaryKey',
  'references',
  'unique',
] as const;
export type ColModName = (typeof colModNames)[number];
const colModNameSet: ReadonlySet<string> = new Set(colModNames);
/** Is this key a modifier call, or one of the builder's own config keys? */
export function isColModName(name: string): name is ColModName {
  return colModNameSet.has(name);
}

/** Sentinel key of a table entry spec (index/unique/check/foreignKey/...). */
export const rtEntrySpecKey: unique symbol = Symbol('rtEntrySpec');
