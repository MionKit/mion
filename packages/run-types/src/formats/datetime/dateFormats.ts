// Native `Date` format TYPE aliases: `Date<P>` brands the JS `Date` OBJECT (not a string) with the
// SAME min/max bound params the string date/time formats use (./dateTimeParams.ts), so both read
// identically. Validation is emitted on the Go side
// (internal/cachegen/typefunctions/formats/datetime/nativeDate.go); serialization needs no new work,
// Date already round-trips through the default serialisers. `TypeFormat` IS imported as a value (not
// `import type`) to keep each brand alias's reflection metadata reachable for tsgo.

import {TypeFormat} from '../../runtypes/typeFormat.ts';
import type {MinMax, DateTimeBound} from './dateTimeParams.ts';

// A bound is an absolute ISO datetime literal OR a relative now±P spec, with both date and time
// duration components allowed (a Date carries both). An Invalid Date (NaN) is always rejected.
export type NativeDateParams = MinMax<DateTimeBound>;

// The `Date` format alias users annotate with, e.g. `Date<{min: 'now'}>`. TRANSPARENT by default
// like `String` / `Number` / `BigInt`; `BrandName` opts INTO a nominal type, matching the value-first
// `date(P, brand('CreatedAt'))` builder. NEVER hardcode a brand arg here: TypeFormat honors
// BrandName, so it would make every `Date<P>` spuriously nominal and split it from that builder.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type Date<P extends NativeDateParams = {}, BrandName extends string = never> = TypeFormat<
  globalThis.Date,
  'nativeDate',
  P,
  BrandName
>;

// `now` is the current instant at validation time.
export type DateFuture = Date<{min: 'now'}>;
export type DatePast = Date<{max: 'now'}>;
