package reflection

// ReflectionSubKind is the second discriminator alongside ReflectionKind. Mirrored to JS in
// packages/run-types/src/go-generated/runTypeKind.generated.ts so structural ids computed on either side agree
// byte-for-byte.
//
// Wherever a SubKind is non-zero, the id algorithm uses `subKind || kind` as the numeric prefix of a structural
// id; the Go-side computer mirrors that rule (cachegen/runtype/typeid).
//
// The `params` subKind (1701) is deliberately not mirrored here: it exists in the reference only because
// deepkit's RT iterates a generic `children` collection and keeps function parameters on a separate property,
// so it synthesises a wrapper for the iterator. Go carries parameters directly on the function node.
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

	// Temporal API SubKinds (2101–2108). NOT mirrored from the reference — Temporal predates its adoption
	// here, so mion owns this numbering. Each is encoded as KindClass + this SubKind + ClassRef.Builtin =
	// "Temporal.<Name>", so the cache footer wires `t.classType = globalThis.Temporal.<Name>`.
	SubKindTemporalInstant        ReflectionSubKind = 2101
	SubKindTemporalZonedDateTime  ReflectionSubKind = 2102
	SubKindTemporalPlainDate      ReflectionSubKind = 2103
	SubKindTemporalPlainTime      ReflectionSubKind = 2104
	SubKindTemporalPlainDateTime  ReflectionSubKind = 2105
	SubKindTemporalPlainYearMonth ReflectionSubKind = 2106
	SubKindTemporalPlainMonthDay  ReflectionSubKind = 2107
	SubKindTemporalDuration       ReflectionSubKind = 2108
)

// BinaryRootGlobals are the two raw buffer types, matched by their own name or by inheritance. Named rather
// than recognised by shape because a buffer has no distinguishing members of its own: `ArrayBuffer` is
// `{byteLength, slice()}`, which any model could match by accident. Both are lib-declared and already covered
// by the structural standard-library test; these two names exist only for the rare user subclass.
//
// The typed arrays and `DataView` are NOT here: they go by SHAPE (IsBinaryViewShape), the only test that keeps
// up. The previous hand-written list of fourteen names was already missing lib.es2025's `Float16Array`.
var BinaryRootGlobals = []string{
	"ArrayBuffer",
	"SharedArrayBuffer",
}

// BinaryViewMembers is the member set of the lib's `ArrayBufferView` interface, the one type every typed array
// AND `DataView` satisfies. Nothing in the lib declares `extends ArrayBufferView` (they match it structurally),
// which is why the TypeScript side tests assignability rather than walking heritage, and why a Go heritage walk
// over names could never see it.
//
// Testing these three members reproduces that assignability without resolving `ArrayBufferView` itself (the
// tsgo shim exposes no global-type lookup). It is the same single test `DataOnlyStripped` uses on the TS side,
// which keeps the two projections agreeing about binary, and it covers Node's `Buffer`, every typed array
// present or future and any user subclass, with no list to maintain.
var BinaryViewMembers = []string{"buffer", "byteLength", "byteOffset"}

var binaryRootSet = toSet(BinaryRootGlobals)

func toSet(names []string) map[string]struct{} {
	set := make(map[string]struct{}, len(names))
	for _, name := range names {
		set[name] = struct{}{}
	}
	return set
}

// IsBinaryRootSymbol reports whether name is one of the raw buffer globals. Callers that can reach the checker
// should prefer typeid.NotDataBuiltinOf, which also covers the view shape and the whole standard library.
func IsBinaryRootSymbol(name string) bool {
	_, ok := binaryRootSet[name]
	return ok
}

// PromiseGlobals are the lib's thenable interfaces, which project to KindPromise and are stripped by every
// emitter (a promise is not data). `PromiseLike` is here because leaving it out was a real bug: it was walked
// as an ordinary interface, and its `then<U, V>(): PromiseLike<U | V>` re-instantiates itself at every level,
// which halted the build. Matched by NAME, not by base: the two are structurally compatible but neither
// declares the other as its base, so a heritage walk does not relate them.
var PromiseGlobals = []string{
	"Promise",
	"PromiseLike",
}

var promiseSet = toSet(PromiseGlobals)

// IsPromiseSymbol reports whether name is one of the thenable globals; every site that recognises a promise
// goes through here so they cannot drift apart again.
func IsPromiseSymbol(name string) bool {
	_, ok := promiseSet[name]
	return ok
}
