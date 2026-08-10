package reflection

import "sort"

// temporal.go is the single source of truth for the builtin Temporal types.
// Every scanner / id / emitter site consults this table instead of
// hard-coding type-name switches, so adding or changing a Temporal type is a
// one-line edit here. Detection is namespace-qualified (the type's symbol
// parent must be the `Temporal` namespace) — see TemporalInfoForSymbol — so a
// user type literally named `PlainDate` never collides with the builtin.

// TemporalNamespace is the namespace symbol name a builtin Temporal type's
// declaration sits under.
const TemporalNamespace = "Temporal"

// TemporalInfo describes one builtin Temporal type.
type TemporalInfo struct {
	// Name is the bare type name (the symbol name), e.g. "PlainDate".
	Name string
	// SubKind is the reflection sub-kind stamped on the RunType.
	SubKind ReflectionSubKind
	// Builtin is the ClassRef.Builtin value — the qualified constructor path
	// the cache footer wires as `globalThis.<Builtin>`, e.g.
	// "Temporal.PlainDate".
	Builtin string
	// HasCompare reports whether the type ships a static `compare(a, b)`
	// (every Temporal type except PlainMonthDay). Drives whether min/max
	// bound support is possible for the Temporal format family.
	HasCompare bool
	// IsDuration flags Temporal.Duration — a length, not a point in time:
	// no ordering against "now", no min/max bound semantics.
	IsDuration bool

	// ── FormatTemporalX<{min,max}> family metadata ──

	// Orderable reports whether the type supports min/max bound constraints —
	// every type with a static `compare` except Duration (a length, not an
	// instant). PlainMonthDay is excluded (no compare).
	Orderable bool
	// FormatName is the FormatAnnotation.Name the FormatTemporalX<P> brand
	// carries (and the emitter registers under), e.g. "temporalPlainDate".
	// Empty for non-orderable types.
	FormatName string
	// NowExpr is the JS expression yielding the current instant AS this type,
	// for evaluating relative `now±P` bounds — e.g.
	// "Temporal.Now.plainDateISO()". Empty for non-orderable types.
	NowExpr string
	// RelComponentKind restricts which ISO-8601 duration components a relative
	// bound may use, mirroring the string date/time rule: "date" → Y/M/W/D,
	// "time" → T-section H/M/S, "dateTime" → both. (A Temporal.Duration with
	// an out-of-kind component throws in `.add()` at runtime — e.g. an Instant
	// can't add calendar units — so we reject those at build time.) Empty for
	// non-orderable types.
	RelComponentKind string
}

// temporalTypes is the registry, keyed by bare type name. Order is the
// canonical declaration order used by tests + docs.
var temporalTypes = map[string]TemporalInfo{
	"Instant": {Name: "Instant", SubKind: SubKindTemporalInstant, Builtin: "Temporal.Instant", HasCompare: true,
		Orderable: true, FormatName: "temporalInstant", NowExpr: "Temporal.Now.instant()", RelComponentKind: "time"},
	"ZonedDateTime": {Name: "ZonedDateTime", SubKind: SubKindTemporalZonedDateTime, Builtin: "Temporal.ZonedDateTime", HasCompare: true,
		Orderable: true, FormatName: "temporalZonedDateTime", NowExpr: "Temporal.Now.zonedDateTimeISO()", RelComponentKind: "dateTime"},
	"PlainDate": {Name: "PlainDate", SubKind: SubKindTemporalPlainDate, Builtin: "Temporal.PlainDate", HasCompare: true,
		Orderable: true, FormatName: "temporalPlainDate", NowExpr: "Temporal.Now.plainDateISO()", RelComponentKind: "date"},
	"PlainTime": {Name: "PlainTime", SubKind: SubKindTemporalPlainTime, Builtin: "Temporal.PlainTime", HasCompare: true,
		Orderable: true, FormatName: "temporalPlainTime", NowExpr: "Temporal.Now.plainTimeISO()", RelComponentKind: "time"},
	"PlainDateTime": {Name: "PlainDateTime", SubKind: SubKindTemporalPlainDateTime, Builtin: "Temporal.PlainDateTime", HasCompare: true,
		Orderable: true, FormatName: "temporalPlainDateTime", NowExpr: "Temporal.Now.plainDateTimeISO()", RelComponentKind: "dateTime"},
	"PlainYearMonth": {Name: "PlainYearMonth", SubKind: SubKindTemporalPlainYearMonth, Builtin: "Temporal.PlainYearMonth", HasCompare: true,
		Orderable: true, FormatName: "temporalPlainYearMonth", NowExpr: "Temporal.Now.plainDateISO().toPlainYearMonth()", RelComponentKind: "date"},
	"PlainMonthDay": {Name: "PlainMonthDay", SubKind: SubKindTemporalPlainMonthDay, Builtin: "Temporal.PlainMonthDay", HasCompare: false},
	"Duration":      {Name: "Duration", SubKind: SubKindTemporalDuration, Builtin: "Temporal.Duration", HasCompare: true, IsDuration: true},
}

// temporalBySubKind is the reverse lookup (SubKind → info), built once.
var temporalBySubKind = func() map[ReflectionSubKind]TemporalInfo {
	out := make(map[ReflectionSubKind]TemporalInfo, len(temporalTypes))
	for _, info := range temporalTypes {
		out[info.SubKind] = info
	}
	return out
}()

// TemporalInfoByName returns the registry entry for a bare Temporal type
// name (caller must have already confirmed the namespace), or ok=false.
func TemporalInfoByName(name string) (TemporalInfo, bool) {
	info, ok := temporalTypes[name]
	return info, ok
}

// TemporalInfoBySubKind returns the registry entry for a SubKind, or
// ok=false when the SubKind isn't a Temporal type.
func TemporalInfoBySubKind(subKind ReflectionSubKind) (TemporalInfo, bool) {
	info, ok := temporalBySubKind[subKind]
	return info, ok
}

// WireFormat / WirePattern describe what this temporal type looks like AS JSON,
// which is what its `toJSON()` emits. Exactly one of the two is set.
//
// Only three land on a registered 2020-12 `format`. The other five carry a
// pattern instead, and that is not a shortcut: ZonedDateTime.toJSON() produces
// RFC 9557 (`2020-01-01T00:00:00+01:00[Europe/Madrid]`), which a `date-time`
// checker REJECTS, and PlainTime / PlainDateTime / PlainYearMonth /
// PlainMonthDay carry no offset where the registered formats require one.
// Claiming a format for those would make a validator reject valid data.
//
// These live in the registry rather than in the converter so validate,
// serialize and convert can never disagree about what a temporal value looks
// like on the wire.
func (info TemporalInfo) WireFormat() string {
	switch info.Name {
	case "Instant":
		return "date-time"
	case "PlainDate":
		return "date"
	case "Duration":
		return "duration"
	}
	return ""
}

// WirePattern is the anchored regular expression matching this type's
// `toJSON()` output, for the five with no honest registered format. Empty when
// WireFormat covers it.
func (info TemporalInfo) WirePattern() string {
	switch info.Name {
	case "ZonedDateTime":
		// RFC 9557: an RFC 3339 timestamp with a bracketed time-zone suffix.
		return `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})\[[^\]]+\]$`
	case "PlainTime":
		return `^\d{2}:\d{2}:\d{2}(?:\.\d+)?$`
	case "PlainDateTime":
		return `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$`
	case "PlainYearMonth":
		return `^\d{4}-\d{2}$`
	case "PlainMonthDay":
		// toJSON() emits the RFC 3339 "--MM-DD" month-day form.
		return `^--\d{2}-\d{2}$`
	}
	return ""
}

// DialectName is the name the json-schema dialect spells this temporal type
// with: the QUALIFIED JavaScript global (`Temporal.Instant`), the same way the
// Date / Map / Set / RegExp rows spell theirs. `jsType` names a JavaScript
// type, and that is the name JavaScript gives it.
//
// This is what `Builtin` already holds, so it is a rename rather than a second
// table. (An earlier pass used the reflected format name to keep the characters
// `Temporal.` out of the published `.d.ts`; the D1 guard now strips string
// literals before it scans, which is the precise rule — a quoted name cannot
// force a lib, only a type reference can.)
func (info TemporalInfo) DialectName() string {
	return info.Builtin
}

// IsTemporalSubKind reports whether subKind is one of the Temporal types.
func IsTemporalSubKind(subKind ReflectionSubKind) bool {
	_, ok := temporalBySubKind[subKind]
	return ok
}

// OrderableTemporalInfos returns every Temporal type that supports min/max
// bounds, sorted by SubKind. Used by the format emitter to register one
// emitter per orderable type.
func OrderableTemporalInfos() []TemporalInfo {
	out := make([]TemporalInfo, 0, len(temporalTypes))
	for _, info := range temporalTypes {
		if info.Orderable {
			out = append(out, info)
		}
	}
	sort.Slice(out, func(i, j int) bool { return out[i].SubKind < out[j].SubKind })
	return out
}
