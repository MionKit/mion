// Shared static params for every date-ish format family — the string
// date/time/dateTime formats today, the native `Date` family, and (later)
// Temporal. Keeping the bound types here means all families accept the
// SAME min/max shape, so a value annotated with one family's bounds reads
// identically under another.
//
// A bound is ALWAYS a string: either an absolute literal in the field's
// own layout (a `YYYY-MM-DD` field takes `'2020-01-01'`, an `HH:mm` field
// takes `'08:30'` — no mixing) OR a relative `now±P…` ISO-8601 duration.
// Numbers (epoch ms) are intentionally NOT accepted — that would mix a
// representation the field's layout can't express. The real validation
// (layout match, calendar validity, per-kind duration component
// restriction) runs build-time on the Go side; TS only carries the brand.

// RelativeNow — `now`, `now+P…`, or `now-P…`. The `P…` tail is a full
// ISO-8601 duration (e.g. `P1Y2M10D`, `PT12H30M`, `P1W`). Go enforces
// that the duration uses only components belonging to the field's own
// kind (date components for date formats, time components for time
// formats; dateTime / native Date accept both).
export type RelativeNow = 'now' | `now+P${string}` | `now-P${string}`;

// A single bound value. We keep the three aliases distinct so call sites
// and docs read clearly even though all three are structurally `string`
// at the type level (TS can't encode "valid in this exact layout").
export type DateBound = string; // 'YYYY-MM-DD'-style literal or RelativeNow
export type TimeBound = string; // 'HH:mm[:ss[.mmm]]'-style literal or RelativeNow
export type DateTimeBound = string; // full datetime literal or RelativeNow

// MinMax — the optional bound set every date-ish params interface mixes
// in. `min`/`max` are INCLUSIVE (>= / <=); `gt`/`lt` are the EXCLUSIVE
// twins (> / <), mirroring the numeric format family. A lower bound is
// EITHER inclusive (`min`) OR exclusive (`gt`), never both; likewise the
// upper bound (`max`/`lt`) — specifying both ends of one edge is redundant
// and Go rejects it at build time. Go also checks a lower bound doesn't
// exceed an upper bound when both are absolute literals.
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
