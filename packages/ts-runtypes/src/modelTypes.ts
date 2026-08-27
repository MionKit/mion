/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Insert / select / update model utilities: plain type transforms over an app type T
// (formats included) that derive the payload shapes the database lanes use. T can be
// an InferSelectModel of a proxy-built table or a hand-written row type. Because they
// are plain type transforms over T, every type format and its params (maxLength,
// min/max, enums, ...) survive into the derived model, so the compiled validators for
// a route input typed with these ARE the full-fidelity validators. Standard runtypes
// vocabulary (exported from the root), reused by the @mionjs/drizzle-orm-*-core
// packages; these transforms must NEVER import anything database-specific.
//
// The variant differences cannot be derived from T alone (defaults and generated
// columns live in the tableConfig), so the special keys are named explicitly:
//   type NewUser = InsertModel<User, 'id', 'createdAt'>;
//   //                              ^generated  ^has a DB default

/** Flattens an intersection into one readable object type (identity otherwise). */
type Prettify<T> = {[K in keyof T]: T[K]} & {};

/** Row shape a select returns for a table generated from T: every key present, and
 *  optional properties of T (nullable columns) come back as value | null. */
export type SelectModel<T> = Prettify<{
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  [K in keyof T]-?: {} extends Pick<T, K> ? NonNullable<T[K]> | null : T[K];
}>;

/** Insert payload for a table generated from T:
 *  - `Generated` keys (identity / generated columns) cannot be sent, they are removed;
 *  - `Defaulted` keys (columns with a DB or runtime default) become optional;
 *  - optional properties of T (nullable columns) stay optional;
 *  - everything else stays required. */
export type InsertModel<T, Generated extends keyof T = never, Defaulted extends keyof T = never> = Prettify<
  Omit<T, Generated | Defaulted> & {[K in Defaulted]?: T[K]}
>;

/** Update payload for a table generated from T: any subset of the insert payload
 *  (generated columns still cannot be sent). */
export type UpdateModel<T, Generated extends keyof T = never> = Prettify<Partial<Omit<T, Generated>>>;
