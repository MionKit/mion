package reflection

// ReflectionSubKind is the second discriminator alongside ReflectionKind.
// Mirrors the numeric values in
// `packages/run-types/src/constants.kind.ts` so structural ids computed on
// either side agree byte-for-byte.
//
// Wherever a SubKind is non-zero, the id algorithm uses `subKind || kind`
// as the numeric prefix when composing a structural id. The Go-side typeid
// computer mirrors that rule (see internal/typeid/typeid.go).
//
// Note: the `params` subKind (1701) is deliberately not mirrored here.
// It exists in the reference only because deepkit's RT iterates a generic `children`
// collection on every node and `TypeFunction` keeps its parameters on a
// separate `parameters` property; the reference synthesises a `subKind=1701` wrapper
// purely so the iterator picks parameters up. The Go side carries
// parameters directly on the function node — no wrapper, no subKind.
type ReflectionSubKind int

const (
	SubKindNone            ReflectionSubKind = 0
	SubKindMapKey          ReflectionSubKind = 1801
	SubKindMapValue        ReflectionSubKind = 1802
	SubKindSetItem         ReflectionSubKind = 1803
	SubKindDate            ReflectionSubKind = 2001
	SubKindMap             ReflectionSubKind = 2002
	SubKindSet             ReflectionSubKind = 2003
	SubKindNonSerializable ReflectionSubKind = 2004

	// Temporal API SubKinds (2101–2108). NOT mirrored from the reference —
	// Temporal predates its adoption here, so ts-runtypes owns this numbering.
	// One per builtin Temporal type; each is encoded as KindClass + this
	// SubKind + ClassRef.Builtin = "Temporal.<Name>" (so the cache footer
	// wires `t.classType = globalThis.Temporal.<Name>`). Mirror to JS in
	// packages/ts-runtypes/src/go-generated/runTypeKind.generated.ts.
	SubKindTemporalInstant        ReflectionSubKind = 2101
	SubKindTemporalZonedDateTime  ReflectionSubKind = 2102
	SubKindTemporalPlainDate      ReflectionSubKind = 2103
	SubKindTemporalPlainTime      ReflectionSubKind = 2104
	SubKindTemporalPlainDateTime  ReflectionSubKind = 2105
	SubKindTemporalPlainYearMonth ReflectionSubKind = 2106
	SubKindTemporalPlainMonthDay  ReflectionSubKind = 2107
	SubKindTemporalDuration       ReflectionSubKind = 2108
)

// The non-serialisable globals: type names whose runtime representation can't
// be serialised. The projection treats them as classes and stamps
// SubKindNonSerializable, so the structural id tells them apart from a "normal"
// user class and no consumer walks their lib member surface.
//
// They are split by HOW a type qualifies, and the split is the whole point.
// Matching only exact names is what let this list fall behind the lib: ESNext
// grew the iterator helpers on `IteratorObject`, Node's `Buffer` is a
// `Uint8Array` subclass, and neither name was here, so the walk opened them up
// and hit a type with no resolvable structural id (MKR009).

// NonSerializableExactGlobals match by their own name ONLY. A user type that
// extends one of these is still a normal class: `class RpcError extends Error`
// is a real, serialisable model that `registerClassSerializer` round-trips, and
// a `Map` is structurally assignable to `WeakMap`. Inheriting from these says
// nothing about whether the value is data.
var NonSerializableExactGlobals = []string{
	"Error",
	"EvalError",
	"RangeError",
	"ReferenceError",
	"SyntaxError",
	"TypeError",
	"URIError",
	"AggregateError",
	"WeakMap",
	"WeakSet",
	// Iterators and generators are matched by NAME, not by base, and that is a
	// correction learned the hard way: base-matching `Iterator` swallowed any
	// user type that extends it to become iterable, so a
	// `PagedCursor<T> extends Iterator<T> {total; pageSize}` lost its own data
	// fields without a word. Extending `Uint8Array` says the value IS binary
	// data; extending `Iterator` says nothing about whether the value is data.
	//
	// The lib's own iterator objects therefore have to be named. They are, and
	// the standing guard against the list falling behind again is the lib matrix
	// (TestLibMatrix_ReflectionSurvivesEveryLib), which reflects under every lib
	// TypeScript ships, so a new edition fails a test instead of a consumer build.
	"Generator",
	"GeneratorFunction",
	"AsyncGenerator",
	"AsyncGeneratorFunction",
	"Iterator",
	"AsyncIterator",
	"IteratorObject",
	"AsyncIteratorObject",
	"ArrayIterator",
	"MapIterator",
	"SetIterator",
	"StringIterator",
	"RegExpStringIterator",
}

// NonSerializableBaseGlobals match by their own name OR by any type that
// INHERITS from one. This is the ONE family where the base genuinely decides
// what the value is: whatever extends a typed array IS binary data, whether it
// is Node's `Buffer` or a user's own subclass. Extra fields bolted onto such a
// subclass do not survive a round trip either, so nothing is lost by taking it
// whole, and `DataOnly<T>` agrees (it strips anything assignable to
// `ArrayBufferView`).
//
// Matching the family instead of the spelling is what lets `Buffer` resolve
// without being named here — and `Buffer` could not be recognised by where it
// is declared, since it comes from @types/node rather than from a lib file.
var NonSerializableBaseGlobals = []string{
	"DataView",
	"ArrayBuffer",
	"SharedArrayBuffer",
	"Float32Array",
	"Float64Array",
	"Int8Array",
	"Int16Array",
	"Int32Array",
	"Uint8Array",
	"Uint8ClampedArray",
	"Uint16Array",
	"Uint32Array",
	"BigInt64Array",
	"BigUint64Array",
}

// NonSerializableGlobals is the union of both sets, in a stable order. It is
// the list mirrored to JS as NON_SERIALIZABLE_GLOBALS.
var NonSerializableGlobals = append(append([]string{}, NonSerializableExactGlobals...), NonSerializableBaseGlobals...)

var nonSerializableExactSet = toSet(NonSerializableExactGlobals)
var nonSerializableBaseSet = toSet(NonSerializableBaseGlobals)

func toSet(names []string) map[string]struct{} {
	set := make(map[string]struct{}, len(names))
	for _, name := range names {
		set[name] = struct{}{}
	}
	return set
}

// IsNonSerializableSymbol reports whether name is one of the globals in either
// set, matched by its OWN name. Callers that can reach the checker should
// prefer typeid.NonSerializableBuiltinOf, which also matches a type through its
// base chain; this stays for the name-only paths.
func IsNonSerializableSymbol(name string) bool {
	if _, ok := nonSerializableExactSet[name]; ok {
		return true
	}
	_, ok := nonSerializableBaseSet[name]
	return ok
}

// IsNonSerializableBaseSymbol reports whether name is one of the BASE-matched
// globals — the families where inheriting from the name qualifies a type too.
func IsNonSerializableBaseSymbol(name string) bool {
	_, ok := nonSerializableBaseSet[name]
	return ok
}

// PromiseGlobals are the lib's thenable interfaces, which project to
// KindPromise and are stripped by every emitter (a promise is not data).
//
// `PromiseLike` is here because leaving it out was a real bug: `Promise`
// matched by name and `PromiseLike` did not, so a `PromiseLike<string>` field
// was walked as an ordinary interface instead, and its `then<U, V>():
// PromiseLike<U | V>` re-instantiates itself at every level, which halted the
// build. They are matched by NAME rather than by base: the two interfaces are
// structurally compatible but neither declares the other as its base, so a
// heritage walk does not relate them.
var PromiseGlobals = []string{
	"Promise",
	"PromiseLike",
}

var promiseSet = toSet(PromiseGlobals)

// IsPromiseSymbol reports whether name is one of the thenable globals. Every
// site that recognises a promise goes through here so the three of them cannot
// drift apart again.
func IsPromiseSymbol(name string) bool {
	_, ok := promiseSet[name]
	return ok
}
