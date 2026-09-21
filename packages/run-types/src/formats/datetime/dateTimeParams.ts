// Shared static params for every date-ish format family (the string date/time/dateTime formats, the
// native `Date` family, later Temporal), so all of them accept the SAME min/max shape. A bound is
// ALWAYS a string: an absolute literal in the field's own layout (a `YYYY-MM-DD` field takes
// `'2020-01-01'`, an `HH:mm` field `'08:30'`, no mixing) OR a relative `now±P…` ISO-8601 duration.
// Epoch-ms numbers are intentionally NOT accepted, the field's layout cannot express them. Layout
// match, calendar validity and the per-kind duration restriction are checked build-time on the Go
// side; TS only carries the brand.

// The `P…` tail is a full ISO-8601 duration (`P1Y2M10D`, `PT12H30M`, `P1W`). Go enforces that it uses
// only components of the field's own kind (dateTime / native Date accept both).
export type RelativeNow = 'now' | `now+P${string}` | `now-P${string}`;

// All three are structurally `string` (TS can't encode "valid in this exact layout"), kept distinct
// so call sites and docs read clearly.
export type DateBound = string; // 'YYYY-MM-DD'-style literal or RelativeNow
export type TimeBound = string; // 'HH:mm[:ss[.mmm]]'-style literal or RelativeNow
export type DateTimeBound = string; // full datetime literal or RelativeNow

// The bound set every date-ish params interface mixes in: `min`/`max` INCLUSIVE, `gt`/`lt` their
// EXCLUSIVE twins, mirroring the numeric family. One edge is either inclusive or exclusive, never
// both; Go rejects that at build time, and a lower bound above an upper one when both are literals.
export interface MinMax<Bound extends string = string> {
  min?: Bound;
  max?: Bound;
  gt?: Bound;
  lt?: Bound;
  /** JSON Schema alias of `min` (inclusive lower bound). Normalised to `min`. */
  minimum?: Bound;
  /** JSON Schema alias of `max` (inclusive upper bound). Normalised to `max`. */
  maximum?: Bound;
  /** JSON Schema alias of `gt` (exclusive lower bound). Normalised to `gt`. */
  exclusiveMinimum?: Bound;
  /** JSON Schema alias of `lt` (exclusive upper bound). Normalised to `lt`. */
  exclusiveMaximum?: Bound;
}
