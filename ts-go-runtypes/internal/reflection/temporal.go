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
