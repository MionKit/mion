---
type: feature
spec: guidelines
status: ready
created: 2026-09-10
---

# A default cap on unbounded collections and strings, seen from validation

## Intent

The per-route request limits refuse a body by size before it is parsed. A different guard is
still missing: a validator that refuses a value whose collection or string is longer than a
configured cap when the type declares no bound of its own. With it on, every type has a maximum,
so every route can derive its request limit from its types instead of falling back to the router
default.

## Direction

The implementer plans the details. What was checked:

- **The cap is a validation semantic, so it is a validate variant.** A knob that changes what the
  generated validator accepts belongs in the `validate.*` option registry
  (`ts-go-runtypes/internal/constants/constants.go`, the `ValidateOption` entries and their
  variant suffix), like `validate.numberMode`, never in a render option alone: two builds with
  different caps must not share a cache entry.
- **Two numbers, both already defined.** The `binarySizing` `items` and `stringBytes` knobs
  (`constants.DefaultSizeItems` / `DefaultSizeStringBytes`) are the natural values; decide whether
  the cap reads them or gets its own pair, and whether it is a RunTypes build option only or also
  a router option. Keep the two limits apart in the docs: the byte limit refuses the body before
  parsing, the collection cap refuses a value during validation.
- **Where the checks land.** The string emitter (`typefunctions/formats/string/stringformat.go`,
  `lengthConditions`) and the array emitter (`formats/structural/arrayformat.go`) already emit
  `maxLength` / `maxItems` checks from params; the cap is the same check applied when the params
  carry no bound. Map / Set take `maxSize` from `structural/mapsetformat.go`. Records and index
  signatures need a key-count check (`maxProperties` exists in `objectformat.go`).
- **The size walk must see it.** With the cap on, `internal/cachegen/jsonsize` treats an unbounded
  string / array / Map / Set / record as bounded by the cap, so the derived request limit becomes
  exact for every type. The walk reads format params today; it needs the cap passed in.
- **Errors.** A refusal reports a format-style error naming the cap, never a bare type mismatch.
- **Tests:** the Go emitter tests per kind, the JS validation suites (a value over the cap is
  refused, at the cap accepted, and a declared bound wins over the cap), the size walk with the
  cap on, and the mock generator staying within the cap.

## Done when

- The cap exists as a validate variant with a documented option name, off by default.
- With it on, a plain string, array, Map, Set and record are refused past the cap and accepted at
  it, with a typed error; a declared bound always wins.
- The request limit of a route with only capped types is derived, not the platform adapter's number.
- The website documents the cap next to the request limits, as two different limits.
