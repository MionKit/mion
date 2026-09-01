// Package reflection defines the canonical runtypes reflection model — the
// `RunType` discriminated union every pipeline stage shares: the resolver
// projects checker types into it, the cache interns and hashes it, the
// emitters render from it, and the generated runtime artifact mirrors it, so
// the user's runtypes RT — which already understands this runtime shape —
// can consume our cache directly. The wire envelope that carries these nodes
// (ops, Request/Response, Sites) lives in internal/protocol.
//
// Because JSON cannot carry cycles or live references, child RunType slots in
// the JSON wire format are ref sentinels: `{kind: -1, id: "<hash>"}`. Two
// consumption paths exist:
//
//  1. The generated `.ts` runtime artifact resolves cycles via direct const
//     assignment — consumers `import { __runtypes }` and call `Map.get(hash)` to
//     obtain a fully-knotted reflection RunType object.
//  2. JSON-only consumers walk `Dump.RunTypes` themselves to re-knot.
//
// IDs are short alphanumeric hash strings (default 7 chars, configurable). The
// hash is derived from the type's structural id (mirroring the
// `_createTypeId` algorithm) — two structurally-equal types share the same
// hash regardless of declaration order or alias name.
package reflection

// ReflectionKind enumerates the discriminator values for every reflection
// `RunType` variant. New values must be appended in declaration order so the
// integer values stay stable across releases.
type ReflectionKind int

const (
	KindNever ReflectionKind = iota
	KindAny
	KindUnknown
	KindVoid
	KindObject
	KindString
	KindNumber
	KindBoolean
	KindSymbol
	KindBigInt
	KindNull
	KindUndefined
	KindRegexp
	KindLiteral
	KindTemplateLiteral
	KindProperty
	KindMethod
	KindFunction
	KindParameter
	KindPromise
	KindClass
	KindTypeParameter
	KindEnum
	KindUnion
	KindIntersection
	KindArray
	KindTuple
	KindTupleMember
	KindEnumMember
	KindRest
	KindObjectLiteral
	KindIndexSignature
	KindPropertySignature
	KindMethodSignature
	KindInfer
	KindCallSignature
)

// KindRef is our sentinel for "this slot points at type id <hash>, look it up
// in the table". Not a reflection kind — the value -1 is reserved for refs.
const KindRef ReflectionKind = -1

// RunType is a JSON-friendly union of every reflection RunType variant. Optional
// fields are gated by `omitempty`. A given RunType uses only the fields relevant
// to its Kind; the rest stay zero/nil.
//
// Child RunType slots (e.g. TypePropertySignature.child) are *RunType so we can
// emit sentinels (`{kind: -1, id: "<hash>"}`) without inlining the referenced
// node.
type RunType struct {
	// TypeAnnotations.
	// ID is always emitted (even empty) because the renderer needs an
	// unambiguous handle for every type.
	ID   string         `json:"id"`
	Kind ReflectionKind `json:"kind"`
	// SubKind disambiguates kinds that map to more than one runtime shape —
	// `Date` / `Map` / `Set` / non-serialisable classes share KindClass but
	// each carry their own SubKind, and Map/Set parameter slots carry the
	// mapKey/mapValue/setItem subkinds. See internal/reflection/subkind.go.
	// Zero (SubKindNone) is "not applicable"; only set on nodes that need it.
	SubKind ReflectionSubKind `json:"subKind,omitempty"`
	// Family classifies the runtype into Atomic/Collection/Member/Function
	// per the RunTypeFamily (ref: packages/run-types/src/types.ts:41). Derived from
	// Kind via FamilyOf in family.go; populated by PopulateFamily at
	// cache-exit time (Cache.Dump / Cache.Added / Cache.NodesForIDs).
	// Refs (Kind=KindRef) and reserved kinds get FamilyUnknown (the empty
	// string), which omitempty strips. The RT compiler uses this to
	// decide whether to inline a node or emit a dependency call.
	Family        Family     `json:"family,omitempty"`
	TypeName      string     `json:"typeName,omitempty"`
	TypeArguments []*RunType `json:"typeArguments,omitempty"`
	// IsCircular flags a RunType that appears inside its own subtree
	// (e.g. `type CA = CA[]`). Mirrors the `isCircular` flag on
	// BaseRunType (ref: packages/run-types/src/lib/baseRunTypes.ts) — the RT compiler
	// uses it to force a self-recursive dependency call instead of
	// inlining the body. Auto-set by the serializer's projection pass
	// (runtype/serialize.go assignID: a back-edge to an in-progress id
	// marks the node circular) and rendered into the cache at the
	// `isCircular` slot so consumers can read it directly. Note:
	// composite kinds (Array/Object/Class/Tuple/Union) are still
	// non-inlined unconditionally in typefns/inlining.go — flipping them
	// to "inline unless circular or named" additionally needs TypeName
	// population on anonymous declarations (deferred).
	IsCircular bool `json:"isCircular,omitempty"`

	// NotSupported flags a "non-data" node — the kinds the type-function
	// emitters ignore (function / method / methodSignature / callSignature /
	// symbol / never / non-serialisable class). These nodes are KEPT in the
	// reflected tree so reflection stays complete, but the validators and
	// serializers drop them at property positions and throw at propagating
	// ones (unchanged). Set on the node itself only (never its children) by
	// PopulateFamily at cache-exit,
	// using the same Kind classification the emitters apply. Reflection
	// consumers read it to know which members the type functions skip.
	NotSupported bool `json:"notSupported,omitempty"`

	// TypeLiteral
	Literal any `json:"literal,omitempty"`

	// TypeProperty / TypePropertySignature / TypeMethod / TypeMethodSignature
	// / TypeParameter / TypeEnumMember — name is `string | number | symbol` in
	// the reflection model; we only emit string. Symbol-named props get a
	// synthetic "@@<name>" string and Flags=["symbol"].
	Name string `json:"name,omitempty"`

	// TypeProperty / TypePropertySignature / TypeParameter etc.
	Optional bool `json:"optional,omitempty"`
	Readonly bool `json:"readonly,omitempty"`

	// NonEnumerable marks a declared property whose by-name write must be
	// gated by a runtime own-enumerability check
	// (`Object.prototype.propertyIsEnumerable.call(v, 'k')`, i.e.
	// `JSON.stringify` semantics) in the serializer families that build output
	// by name (prepareForJsonSafe / stringifyJson / the JSON composites / tb).
	// Set for two id-relevant cases (typeid.IsNonEnumerable, shared by the
	// projection and the structural id so they can't drift): (1) a property
	// inherited from a default-lib GLOBAL interface/class (Error's
	// name/message/stack, …) whose runtime descriptor is non-enumerable, and
	// (2) a user property tagged `@nonEnumerable` in JSDoc — the type-aware
	// bridge for a descriptor TS can't express (it models only readonly/`?`).
	// A guarded property is also marked Optional (the wire shape is
	// enumerability-driven, so validators and the presence path must treat it
	// as possibly-absent); NonEnumerable additionally tells the emitters to
	// gate the write on enumerability rather than `!== undefined`.
	NonEnumerable bool `json:"nonEnumerable,omitempty"`

	// TypeProperty / TypeMethod. Both flags use `is`-prefixed names so the
	// emitted JS mirror lands on plain identifiers (not reserved words),
	// which lets the cache-module factory bind them without aliasing.
	Visibility *int `json:"visibility,omitempty"`
	IsAbstract bool `json:"isAbstract,omitempty"`
	IsStatic   bool `json:"isStatic,omitempty"`

	// IsSafeName — true when Name is a valid JS identifier and the
	// consumer can emit `obj.<name>` dot access; false (omitted) means
	// bracket notation is required. Mirrors the isSafeName helper
	// at runtype level so downstream codegen need not re-run the regex.
	// Populated only on TypeProperty / TypePropertySignature / TypeMethod /
	// TypeMethodSignature.
	IsSafeName bool `json:"isSafeName,omitempty"`

	// Position — 0-based slot index in the parent (function parameter list
	// or tuple). Pointer so position 0 ships explicitly (`position: 0` is
	// not stripped by omitempty). Nil for kinds that aren't positional.
	// Populated only on TypeParameter and TypeTupleMember.
	Position *int `json:"position,omitempty"`

	// DefaultVal — literal-only; non-literal defaults are omitted with a
	// Flags marker. Function/expression defaults are recorded in Flags as
	// "nonLiteralDefault". Named with the `Val` suffix so the JS mirror
	// (`defaultVal`) avoids the `default` reserved word.
	DefaultVal any `json:"defaultVal,omitempty"`

	// TypeFunction / TypeMethod / TypeMethodSignature / TypeCallSignature
	Parameters []*RunType `json:"parameters,omitempty"`
	Return     *RunType   `json:"return,omitempty"`

	// TypeArray / TypePromise / TypeRest / TypeIndexSignature.child
	// / TypeTupleMember.child / TypePropertySignature.child / TypeProperty.child
	// / TypeParameter.child
	Child *RunType `json:"child,omitempty"`

	// TypeIndexSignature
	Index *RunType `json:"index,omitempty"`

	// TypeUnion / TypeIntersection / TypeTuple / TypeObjectLiteral / TypeClass
	// — all use `children: []` of whichever child variants are legal.
	Children []*RunType `json:"children,omitempty"`

	// TypeUnion only — safe order computed at serialize time. Each entry
	// is a ref pointing at the same canonical child as Children, but
	// reordered so more-specific (superset) members precede their subset
	// equivalents. Prevents unreachable union members at validate time.
	// Empty for unions that don't need reordering (≤1 object member).
	SafeUnionChildren []*RunType `json:"safeUnionChildren,omitempty"`

	// TypeUnion only — set by the serialize-time discriminator detection
	// pass. Parallel to SafeUnionChildren: entry i is a ref to the
	// discriminator property within SafeUnionChildren[i]. Consumer reads
	// entry.Name for the property key and entry.Child for the expected
	// type. Slots for non-object members (simple / any) are nil. When
	// detection finds no usable discriminator, the field is empty.
	//
	// Lives on the union itself so the relationship is correctly scoped —
	// the same canonical property node may be a discriminator in one
	// parent union but not in another.
	//
	// Wire-format equivalent of the FlattenedProp[] output
	// (ref: packages/run-types/src/nodes/collection/unionDiscriminator.ts).
	// We carry only the strictly-new field (a ref to the property);
	// the other FlattenedProp fields are reconstructible from the
	// surrounding context. JS-side consumers use
	// `flattenUnionDiscriminators` from mion to
	// materialise the full per-member struct.
	UnionDiscriminators []*RunType `json:"unionDiscriminators,omitempty"`

	// TypeMeta — the OPEN metadata extension point: user-space (or
	// third-party) type-level metadata the engine carries but MUST NEVER
	// interpret. Any object-literal member of an `atomic & { obj }`
	// intersection that is not a recognised sentinel lands here (e.g.
	// `string & {__brand: "Email"}`, `number & {dbIndex: true}`) — no
	// marker or registration required. Each entry is a ref to an
	// objectLiteral RunType, passed through untouched: it folds into the
	// structural id (so differently-annotated types never share a cache
	// entry) and rides the runtime cache so reflection consumers can read
	// their own annotations back — but no emitter may key behavior off its
	// contents. Engine-recognised behavior lives ONLY behind the
	// symbol-keyed sentinels: FormatAnnotation (below, the CLOSED format
	// vocabulary produced by TypeFormat brands) and the SchemaChecks
	// group — that unforgeable-key split is what keeps arbitrary user
	// metadata safe to carry. This is the generic form of deepkit's "type
	// decorators" (TypeAnnotations.decorators), renamed from `decorators`
	// to avoid confusion with JS `@decorator`s and to subsume the former
	// number `brand` field. Order is the declaration order of the members
	// in the original intersection.
	TypeMeta []*RunType `json:"typeMeta,omitempty"`

	// FormatAnnotation — populated when a primitive is branded with a
	// TypeFormat<Base, Name, Params, ...> marker from
	// `@mionjs/run-types/formats`. Mirrors the FormatAnnotation
	// (ref: packages/run-types/src/lib/formats.ts) — the name + params pair
	// that drives format-aware emit for validate / validationErrors. The
	// structural id folds Name + canonicalised Params into the hash so
	// two distinct param sets produce two distinct cache entries;
	// equivalent param sets (regardless of key order) collapse to one.
	// Lifted into a dedicated field rather than living in TypeMeta
	// so the emit hook is a single pointer check, not a per-emit
	// decorator-array scan.
	//
	// The CLOSED counterpart of TypeMeta above: recognition rides the
	// unforgeable `__rtFormatName` / `__rtFormatParams` unique-symbol
	// sentinels, so only a real TypeFormat brand can ever trigger engine
	// behavior (format-aware validate/verr emit, formatters, mock pools) —
	// a hand-written metadata object cannot, no matter its shape.
	FormatAnnotation *FormatAnnotation `json:"formatAnnotation,omitempty"`

	// SchemaChecks — the sentinel-lifted JSON Schema constraint checks
	// (Negations / Contains / PatternProps / PropNames / OneOf /
	// Unevaluated). Embedded WITHOUT a field name so encoding/json promotes
	// the fields flat onto the wire and Go call sites keep reading
	// `node.Negations` etc. — the grouping is declaration-level only, the
	// JSON bytes are unchanged. Shared contract + per-field docs live on
	// the SchemaChecks type below.
	SchemaChecks

	// Overrides — populated when a user registers a custom function for this
	// type via `overrideX<T>(pureFn)`. Maps a public family op key ("val",
	// "verr", "jsonEncoder", …) to the cfn body hash of the override pure fn
	// (`cfn::<hash>`). The structural id folds each (family, hash) pair in via
	// OverrideStructuralKey so an overridden type gets a distinct id from its
	// un-overridden twin AND the override propagates to every containing type
	// (a parent's id composes its children's folded ids). The type-fn emitter
	// reads this to substitute a cfn redirect for the structural body of the
	// matching family — every other family re-emits its structural body under
	// the new id. Keyed by family op key (operations.Operation.FnKey), NOT the
	// emitted family tag, so a JSON override (one op, several strategy tags)
	// matches with a single entry.
	Overrides map[string]string `json:"overrides,omitempty"`

	// TypeEnum. `EnumVal` uses the `Val` suffix so the JS mirror lands as
	// `enumVal`, sidestepping the `enum` reserved word.
	EnumVal map[string]any `json:"enumVal,omitempty"`
	Values  []any          `json:"values,omitempty"`
	IndexT  *RunType       `json:"indexType,omitempty"`

	// TypeClass
	ExtendsArguments []*RunType `json:"extendsArguments,omitempty"`
	Implements       []*RunType `json:"implements,omitempty"`
	Arguments        []*RunType `json:"arguments,omitempty"`
	// Extends — TypeObjectLiteral (interface form) only — the direct
	// parent interface types this declaration extends. Each entry is a
	// ref to the parent's RunType. Properties inherited from these
	// parents are ALSO included in Children (the TS checker merges them
	// via GetPropertiesOfType), so the runtime path stays simple while
	// codegen can walk the inheritance tree explicitly via Extends.
	// Empty for anonymous object literals and `type` aliases.
	Extends []*RunType `json:"extends,omitempty"`
	// classType is a runtime constructor reference — see workaround docs.
	// We emit the class's exported name + module path so a v2 footer can wire
	// up an `import { Class } from "..."`.
	ClassRef *ClassRef `json:"classRef,omitempty"`

	// TypeTemplateLiteral, TypeRegexp, TypeInfer — placeholder for v2.

	// Flags carries free-form markers for things we couldn't bridge cleanly
	// (e.g. "symbol" for symbol-keyed names, "nonLiteralDefault", "bigint").
	Flags []string `json:"flags,omitempty"`

	// Description — JSDoc-style per-member comment. v2.
	Description string `json:"description,omitempty"`
}

// SchemaChecks groups the sentinel-lifted structural constraint checks a
// RunType can carry. Every field follows the same three-part contract:
//
//   - it is populated from a `__rt…` sentinel member (`__rtContains` /
//     `__rtPatternProps` / `__rtPropNames`) lifted OFF the property walk — a
//     sentinel must never surface as a real object property;
//   - it folds into the structural id, so a checked type can never share a
//     cache entry with its unchecked twin (id = behavior);
//   - it is consumed by validate/validationErrors ONLY — the JSON codecs,
//     DataOnly and binary all key off the positive base node.
//
// Embedded (unnamed) in RunType so encoding/json serialises the fields flat
// and Go code reads them promoted (`node.Contains`). Two promotion caveats:
// a promoted field cannot be set in a RunType composite literal (set it after
// construction, or via `SchemaChecks: SchemaChecks{…}`), and a future RunType
// field must never reuse one of these JSON keys — encoding/json silently
// drops a same-depth key conflict from the output. Child-bearing slots are
// enumerated by eachRefSlot (refslots.go); a slot added here must be wired
// into that method.
type SchemaChecks struct {
	// Contains — one entry per `__rtContains` sentinel member, the internal
	// encoding of contains / minContains / maxContains. Each
	// entry pairs a fully serialized child with its occurrence bounds:
	// validate counts the array items matching the child and asserts
	// Min ≤ count (and count ≤ Max when Max ≥ 0).
	Contains []*ContainsCheck `json:"contains,omitempty"`

	// PatternProps — from the `__rtPatternProps` sentinel member
	// (patternProperties): each entry pairs a key regex SOURCE with
	// the value child every matching key must validate against (plus a
	// pattern-branded key child that exists so the build-time
	// pattern-sample pools ride into the runtime cache for key mocking).
	// Sorted by source.
	PatternProps []*PatternPropCheck `json:"patternProps,omitempty"`

	// PropNames — one entry per `__rtPropNames` sentinel member
	// (propertyNames): every KEY of the object validates as a string
	// against EVERY child (allOf-stacked propertyNames conjoin, mirroring
	// the sorted `pn{…}` id fold).
	PropNames []*RunType `json:"propNames,omitempty"`
}

// ClassRef captures enough provenance for a v2 footer to wire up
// `t.classType = ImportedConstructor` in the generated `.ts` artifact.
//
// For recognised built-in classes (Date, Map, Set, RegExp), Builtin
// is set to the constructor name and the footer emits
// `t.classType = globalThis.<Name>`. For user classes, Module is the
// originating module path and Name the exported symbol.
type ClassRef struct {
	Builtin string `json:"builtin,omitempty"` // "Date" | "Map" | "Set" | "RegExp"
	Name    string `json:"name,omitempty"`    // user-class export name
	Module  string `json:"module,omitempty"`  // originating module path
}

// FormatAnnotation carries the (name, params) pair extracted from a
// TypeFormat<Base, Name, Params, ...> brand. Name identifies the
// format family ("uuid", "email", "stringFormat", …) — both the
// JS-side format registry and the Go-side format-emitter registry
// key on this. Params is the JSON-serialisable literal payload (e.g.
// `{"version": "4"}` for FormatUUIDv4, `{"maxLength": 10}` for a
// FormatString). The map is canonicalised (sorted keys, recursed
// into nested objects) before participating in the structural id.
type FormatAnnotation struct {
	Name   string         `json:"name"`
	Params map[string]any `json:"params,omitempty"`
}

// ContainsCheck is one contains assertion on an array-shaped
// node: at least Min (and at most Max, when Max ≥ 0; -1 means unbounded)
// of the array's items validate against Child.
type ContainsCheck struct {
	Child *RunType `json:"child"`
	Min   float64  `json:"min"`
	Max   float64  `json:"max"`
}

// PatternPropCheck is one JSON Schema patternProperties entry: keys matching
// Source (an unanchored 2020-12 regex) must have values validating against
// Value. Key is the pattern-branded string child whose build-time sample
// pool powers key mocking; it never validates (Source is the check).
type PatternPropCheck struct {
	Source string   `json:"source"`
	Key    *RunType `json:"key"`
	Value  *RunType `json:"value"`
}

// NewRef returns a sentinel RunType pointing at id. The TS artifact emitter
// resolves these into direct const references.
func NewRef(id string) *RunType {
	return &RunType{Kind: KindRef, ID: id}
}
