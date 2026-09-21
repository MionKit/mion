// Package reflection defines the canonical RunType model every pipeline stage shares: the resolver projects
// checker types into it, the cache interns and hashes it, the emitters render from it, and the generated
// runtime artifact mirrors it. The wire envelope carrying these nodes (ops, Request/Response, Sites) lives in
// internal/protocol. JSON carries no cycles, so a child slot on the wire is a ref sentinel
// (`{kind: -1, id: "<hash>"}`): the generated `.ts` module re-knots them by direct const assignment, and a
// JSON-only consumer walks `Dump.RunTypes` to re-knot them itself. An id is a short hash of the type's
// structural id (hashid.DefaultLength, 7 characters), so two structurally-equal types share one id whatever
// their declaration order or alias name.
package reflection

// ReflectionKind enumerates the discriminator values for every RunType variant. New values must be APPENDED:
// the integer values are the wire form and stay stable across releases.
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

// KindRef is the sentinel for "this slot points at type id <hash>"; not a kind, -1 is reserved for refs.
const KindRef ReflectionKind = -1

// RunType is a JSON-friendly union of every RunType variant: a node uses only the fields its Kind needs and
// leaves the rest zero. Child slots are *RunType so a sentinel can stand in for the referenced node.
type RunType struct {
	// ID is always emitted, even empty: the renderer needs an unambiguous handle for every type.
	ID   string         `json:"id"`
	Kind ReflectionKind `json:"kind"`
	// SubKind disambiguates kinds that map to more than one runtime shape: Date / Map / Set / non-serialisable
	// classes all share KindClass, and Map/Set parameter slots carry the mapKey/mapValue/setItem subkinds.
	// Zero (SubKindNone) is "not applicable". See subkind.go.
	SubKind ReflectionSubKind `json:"subKind,omitempty"`
	// Family is derived from Kind by FamilyOf (family.go) and stamped by PopulateFamily at intern time; refs
	// and the reserved kinds get FamilyUnknown, which omitempty strips. Decides whether a node is inlined or
	// emitted as a dependency call.
	Family        Family     `json:"family,omitempty"`
	TypeName      string     `json:"typeName,omitempty"`
	TypeArguments []*RunType `json:"typeArguments,omitempty"`
	// IsCircular flags a RunType that appears inside its own subtree (`type CA = CA[]`), which forces a
	// self-recursive dependency call instead of an inlined body. Set by the serializer's projection pass
	// (cachegen/runtype/serialize.go assignID: a back-edge to an in-progress id) and rendered into the cache so
	// consumers read it directly. Composite kinds (Array/Object/Class/Tuple/Union) are still non-inlined
	// unconditionally in typefunctions/inlining.go: flipping them to "inline unless circular or named" also
	// needs TypeName on anonymous declarations (deferred).
	IsCircular bool `json:"isCircular,omitempty"`

	// NotSupported flags a "non-data" node (IsNotSupportedKind in family.go). Such nodes are KEPT in the
	// reflected tree so reflection stays complete, but validators and serializers drop them at property
	// positions and throw at propagating ones. Stamped by PopulateFamily at intern time, on the node itself
	// only, never its children.
	NotSupported bool `json:"notSupported,omitempty"`

	// TypeLiteral
	Literal any `json:"literal,omitempty"`

	// TypeProperty / TypePropertySignature / TypeMethod / TypeMethodSignature / TypeParameter / TypeEnumMember.
	// A name is `string | number | symbol` in the model but only ever emitted as a string: a symbol-named
	// property gets a synthetic "@@<name>" plus Flags=["symbol"].
	Name string `json:"name,omitempty"`

	// TypeProperty / TypePropertySignature / TypeParameter etc.
	Optional bool `json:"optional,omitempty"`
	Readonly bool `json:"readonly,omitempty"`

	// NonEnumerable marks a declared property whose by-name write must be gated by a runtime own-enumerability
	// check (`Object.prototype.propertyIsEnumerable.call(v, 'k')`, i.e. `JSON.stringify` semantics) in every
	// serializer family that builds output by name. Set for two id-relevant cases (typeid.IsNonEnumerable,
	// shared by the projection and the structural id so they cannot drift): a property inherited from a
	// default-lib GLOBAL interface or class (Error's name/message/stack, …) whose runtime descriptor is
	// non-enumerable, and a user property tagged `@nonEnumerable` in JSDoc, the bridge for a descriptor TS
	// cannot express. Such a property is ALSO marked Optional, because the wire shape is enumerability-driven;
	// NonEnumerable additionally says to gate the write on enumerability rather than on `!== undefined`.
	NonEnumerable bool `json:"nonEnumerable,omitempty"`

	// TypeProperty / TypeMethod. The `is` prefixes keep the emitted JS mirror off reserved words, so the
	// cache-module factory binds them without aliasing.
	Visibility *int `json:"visibility,omitempty"`
	IsAbstract bool `json:"isAbstract,omitempty"`
	IsStatic   bool `json:"isStatic,omitempty"`

	// IsSafeName — true when a consumer may emit `obj.<name>` dot access, false when bracket notation is
	// required (see IsSafeName in safe_name.go), carried here so downstream codegen need not re-test the name.
	// Populated only on TypeProperty / TypePropertySignature / TypeMethod / TypeMethodSignature.
	IsSafeName bool `json:"isSafeName,omitempty"`

	// Position — 0-based slot index in the parent parameter list or tuple, on TypeParameter and TypeTupleMember
	// only. A pointer so position 0 ships explicitly instead of being stripped by omitempty.
	Position *int `json:"position,omitempty"`

	// DefaultVal — literal-only: a function or expression default is omitted and recorded in Flags as
	// "nonLiteralDefault". The `Val` suffix keeps the JS mirror off the `default` reserved word.
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

	// TypeUnion / TypeIntersection / TypeTuple / TypeObjectLiteral / TypeClass.
	Children []*RunType `json:"children,omitempty"`

	// TypeUnion only — the same refs as Children, reordered at serialize time so a superset member precedes its
	// subset equivalents, which is what keeps a union member from being unreachable at validate time. Empty for
	// a union of one member or none.
	SafeUnionChildren []*RunType `json:"safeUnionChildren,omitempty"`

	// TypeUnion only — parallel to SafeUnionChildren: entry i is a ref to the discriminator property within
	// SafeUnionChildren[i], nil for a non-object member, and the whole field is empty when detection found no
	// usable discriminator. A consumer reads entry.Name for the key and entry.Child for the expected type.
	// Lives on the union rather than on the property because the same canonical property node may be a
	// discriminator in one parent union and not in another.
	UnionDiscriminators []*RunType `json:"unionDiscriminators,omitempty"`

	// TypeMeta — the OPEN metadata extension point: type-level metadata the engine carries but MUST NEVER
	// interpret. Any object-literal member of an `atomic & { obj }` intersection that is not a recognised
	// sentinel lands here (`string & {__brand: "Email"}`, `number & {dbIndex: true}`), no marker or
	// registration required, in the declaration order of the intersection. Each entry is a ref to an
	// objectLiteral RunType passed through untouched: it folds into the structural id, so differently-annotated
	// types never share a cache entry, and it rides the runtime cache so reflection consumers read their own
	// annotations back. NO emitter may key behavior off its contents: engine-recognised behavior lives ONLY
	// behind the symbol-keyed sentinels, FormatAnnotation below and the SchemaChecks group, and that
	// unforgeable-key split is what makes arbitrary user metadata safe to carry.
	TypeMeta []*RunType `json:"typeMeta,omitempty"`

	// FormatAnnotation — populated when a primitive is branded with a TypeFormat<Base, Name, Params, …> marker
	// from `@mionjs/run-types/formats`: the name + params pair driving format-aware emit for validate and
	// validationErrors. The structural id folds Name plus canonicalised Params in, so two distinct param sets
	// produce two cache entries and equivalent ones (whatever the key order) collapse to one. A dedicated field
	// rather than a TypeMeta member so the emit hook is one pointer check, not a per-emit array scan.
	//
	// The CLOSED counterpart of TypeMeta: recognition rides the unforgeable `__rtFormatName` /
	// `__rtFormatParams` unique-symbol sentinels, so only a real TypeFormat brand can trigger engine behavior
	// (format-aware emit, formatters, mock pools); a hand-written metadata object cannot, whatever its shape.
	FormatAnnotation *FormatAnnotation `json:"formatAnnotation,omitempty"`

	// SchemaChecks — the sentinel-lifted JSON Schema constraint checks
	// (Contains / PatternProps / PropNames). Embedded WITHOUT a field name so
	// encoding/json promotes the fields flat onto the wire and Go call sites keep
	// reading `node.Contains` etc: the grouping is declaration-level only, the JSON
	// bytes are unchanged. Per-field docs live on the SchemaChecks type below.
	SchemaChecks

	// Overrides — populated when a user registers a custom function for this
	// type via `overrideX<T>(pureFn)`, mapping the operation name to the cfn body hash of the override. The
	// structural id folds each (family, hash) pair in via OverrideStructuralKey, so an overridden type gets a
	// distinct id from its un-overridden twin AND the override propagates to every containing type. The type-fn
	// emitter substitutes a cfn redirect for the structural body of the matching family; every other family
	// re-emits its structural body under the new id. Keyed by the operation NAME (operations.Operation.Name),
	// NOT the emitted family tag, so a JSON override (one op, several strategy tags) matches with one entry,
	// and NOT the marker token, so renaming the public vocabulary can never move an overridden type's id.
	Overrides map[string]string `json:"overrides,omitempty"`

	// TypeEnum. The `Val` suffix keeps the JS mirror (`enumVal`) off the `enum` reserved word.
	EnumVal map[string]any `json:"enumVal,omitempty"`
	Values  []any          `json:"values,omitempty"`
	IndexT  *RunType       `json:"indexType,omitempty"`

	// TypeClass
	ExtendsArguments []*RunType `json:"extendsArguments,omitempty"`
	Implements       []*RunType `json:"implements,omitempty"`
	Arguments        []*RunType `json:"arguments,omitempty"`
	// Extends — the direct parent interfaces of a TypeObjectLiteral in interface form, empty for an anonymous
	// object literal or a `type` alias. Inherited properties are ALSO in Children (the checker merges them),
	// so the runtime path stays simple and only codegen walks the inheritance tree through Extends.
	Extends []*RunType `json:"extends,omitempty"`
	// ClassRef carries the class's exported name and module path, the provenance a footer needs to wire
	// `classType` to a real constructor.
	ClassRef *ClassRef `json:"classRef,omitempty"`

	// TypeTemplateLiteral, TypeRegexp, TypeInfer — placeholder for v2.

	// Flags carries free-form markers for what the model cannot express ("symbol", "nonLiteralDefault", "bigint").
	Flags []string `json:"flags,omitempty"`

	// Description — JSDoc-style per-member comment. v2.
	Description string `json:"description,omitempty"`
}

// SchemaChecks groups the sentinel-lifted structural constraint checks a RunType can carry. Every field
// follows the same three-part contract:
//
//   - it is populated from a `__rt…` sentinel member lifted OFF the property walk, a sentinel never
//     surfacing as a real object property;
//   - it folds into the structural id, so a checked type can never share a cache entry with its unchecked
//     twin (id = behavior);
//   - it is consumed by validate / validationErrors ONLY: the JSON codecs, DataOnly and binary all key off
//     the positive base node.
//
// Embedded unnamed in RunType so encoding/json serialises the fields flat and Go reads them promoted
// (`node.Contains`). Two promotion caveats: a promoted field cannot be set in a RunType composite literal (set
// it after construction, or via `SchemaChecks: SchemaChecks{…}`), and a future RunType field must never reuse
// one of these JSON keys, since encoding/json silently drops a same-depth key conflict. Child-bearing slots
// are enumerated by eachRefSlot (refslots.go); a slot added here must be wired into that method.
type SchemaChecks struct {
	// Contains — one entry per `__rtContains` sentinel member, the internal encoding of contains / minContains
	// / maxContains: validate counts the array items matching Child and asserts the entry's bounds.
	Contains []*ContainsCheck `json:"contains,omitempty"`

	// PatternProps — from the `__rtPatternProps` sentinel member (patternProperties), sorted by source: a key
	// regex source plus the value child every matching key must validate against. The pattern-branded key child
	// exists so the build-time pattern-sample pools reach the runtime cache for key mocking.
	PatternProps []*PatternPropCheck `json:"patternProps,omitempty"`

	// PropNames — one entry per `__rtPropNames` sentinel member (propertyNames): every KEY of the object
	// validates as a string against EVERY child, allOf-stacked, mirroring the sorted `pn{…}` id fold.
	PropNames []*RunType `json:"propNames,omitempty"`
}

// ClassRef captures the provenance a generated `.ts` artifact needs to wire `t.classType` to a constructor.
// For a recognised built-in (Date, Map, Set, RegExp, Temporal.X) Builtin holds the constructor name and the
// footer emits `t.classType = globalThis.<Builtin>`; for a user class, Module and Name record where it came
// from, for a footer that imports it.
type ClassRef struct {
	Builtin string `json:"builtin,omitempty"` // "Date" | "Map" | "Set" | "RegExp"
	Name    string `json:"name,omitempty"`    // user-class export name
	Module  string `json:"module,omitempty"`  // originating module path
}

// FormatAnnotation carries the (name, params) pair extracted from a TypeFormat<Base, Name, Params, …> brand.
// Name identifies the format family ("uuid", "email", "stringFormat", …) and both the JS-side format registry
// and the Go-side format-emitter registry key on it. Params is the JSON-serialisable literal payload
// (`{"maxLength": 10}`), canonicalised (sorted keys, recursed) before it enters the structural id.
type FormatAnnotation struct {
	Name   string         `json:"name"`
	Params map[string]any `json:"params,omitempty"`
}

// ContainsCheck is one contains assertion on an array-shaped node: at least Min and at most Max of the items
// validate against Child, Max of -1 meaning unbounded.
type ContainsCheck struct {
	Child *RunType `json:"child"`
	Min   float64  `json:"min"`
	Max   float64  `json:"max"`
}

// PatternPropCheck is one JSON Schema patternProperties entry: a key matching Source (an unanchored 2020-12
// regex) must have a value validating against Value. Key is the pattern-branded string child whose build-time
// sample pool powers key mocking; it never validates, Source is the check.
type PatternPropCheck struct {
	Source string   `json:"source"`
	Key    *RunType `json:"key"`
	Value  *RunType `json:"value"`
}

// NewRef returns a sentinel RunType pointing at id; the TS artifact emitter resolves it to a const reference.
func NewRef(id string) *RunType {
	return &RunType{Kind: KindRef, ID: id}
}
