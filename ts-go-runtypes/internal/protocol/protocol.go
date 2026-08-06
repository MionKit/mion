// Package protocol defines the wire types exchanged between the ts-runtypes
// resolver and its callers. The shape is the canonical runtypes reflection
// `RunType` discriminated union so the user's runtypes RT — which already
// understands this runtime shape — can consume our cache directly.
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
package protocol

import (
	"encoding/json"
	"io"

	"github.com/mionkit/ts-runtypes/internal/diagnostics"
)

func jsonMarshal(v any) ([]byte, error) { return json.Marshal(v) }

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
	// mapKey/mapValue/setItem subkinds. See internal/protocol/subkind.go.
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
	// `flattenUnionDiscriminators` from ts-runtypes to
	// materialise the full per-member struct.
	UnionDiscriminators []*RunType `json:"unionDiscriminators,omitempty"`

	// TypeMeta — opaque type-level metadata: the object-literal members
	// that survive a collapsed intersection of a primitive with one or
	// more metadata objects (e.g. `string & {__brand: "Email"}` or
	// `number & {currency: "USD"}`). Any `atomic & { obj }` qualifies —
	// no brand marker is required. Each entry is a ref to an objectLiteral
	// RunType, passed through untouched for consumers to read. This is the
	// generic form of deepkit's "type decorators" (TypeAnnotations.decorators),
	// renamed from `decorators` to avoid confusion with JS `@decorator`s and
	// to subsume the former number `brand` field. Order is the declaration
	// order of the members in the original intersection. FormatAnnotation
	// (below) is the validating specialisation, lifted out of TypeMeta.
	TypeMeta []*RunType `json:"typeMeta,omitempty"`

	// FormatAnnotation — populated when a primitive is branded with a
	// TypeFormat<Base, Name, Params, ...> marker from
	// `ts-runtypes/formats`. Mirrors the FormatAnnotation
	// (ref: packages/run-types/src/lib/formats.ts) — the name + params pair
	// that drives format-aware emit for validate / validationErrors. The
	// structural id folds Name + canonicalised Params into the hash so
	// two distinct param sets produce two distinct cache entries;
	// equivalent param sets (regardless of key order) collapse to one.
	// Lifted into a dedicated field rather than living in TypeMeta
	// so the emit hook is a single pointer check, not a per-emit
	// decorator-array scan.
	FormatAnnotation *FormatAnnotation `json:"formatAnnotation,omitempty"`

	// Negations — populated when the type carries one or more `__rtNot`
	// sentinel members (`Base & {readonly __rtNot?: Child}`), the internal
	// encoding of JSON Schema `not` and the format-scoped `Not<F>`. Each
	// entry is the fully serialized CHILD node whose validator the emit
	// inverts: validate = base && !(childValidate). Like FormatAnnotation
	// the sentinel is lifted OFF the property walk (it must never surface
	// as a real object property) and folds into the structural id, so
	// `string` and `string ∧ ¬Email` can never share a cache entry. The
	// negation is validate/validationErrors-only by design: JSON codecs,
	// DataOnly and binary all key off the positive base node.
	Negations []*RunType `json:"negations,omitempty"`

	// Contains — populated when the type carries one or more `__rtContains`
	// sentinel members, the internal encoding of JSON Schema contains /
	// minContains / maxContains. Each entry pairs a fully serialized child
	// with its occurrence bounds: validate counts the array items matching
	// the child and asserts Min ≤ count (and count ≤ Max when Max ≥ 0).
	// Lifted off the property walks and folded into the structural id like
	// Negations, and equally validate/validationErrors-only: JSON codecs,
	// DataOnly and binary key off the positive base node.
	Contains []*ContainsCheck `json:"contains,omitempty"`

	// PatternProps — populated when the type carries a `__rtPatternProps`
	// sentinel member (JSON Schema patternProperties): each entry pairs a
	// key regex SOURCE with the value child every matching key must
	// validate against (plus a pattern-branded key child that exists so
	// the build-time pattern-sample pools ride into the runtime cache for
	// key mocking). Sorted by source; validate/validationErrors-only.
	PatternProps []*PatternPropCheck `json:"patternProps,omitempty"`

	// PropNames — populated when the type carries a `__rtPropNames`
	// sentinel member (JSON Schema propertyNames): every KEY of the object
	// validates as a string against this child. validate/verr-only.
	PropNames *RunType `json:"propNames,omitempty"`

	// OneOf — populated on a union node when the type carries a `__rtOneOf`
	// sentinel member (the OneOf<[…]> combinator / JSON Schema oneOf):
	// the BRANCH list as written, preserving the grouping the flattened
	// union erases (a branch may itself be a union). validate counts the
	// branches the value matches and asserts the count is exactly one;
	// Children still hold the flattened members so serialization, DataOnly
	// and every other positive pathway stay untouched. validate/verr-only.
	OneOf []*RunType `json:"oneOf,omitempty"`

	// Unevaluated — populated when the type carries an `__rtUnevaluated`
	// sentinel member (JSON Schema unevaluatedProperties, for the scopes the
	// document alone cannot decide). Keys/Sources are evaluated
	// unconditionally; Groups carry the contributions a guard decides at run
	// time. Lifted off the property walks and folded into the structural id
	// like Negations, and equally validate/verr-only.
	Unevaluated *UnevaluatedCheck `json:"unevaluated,omitempty"`

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

// ContainsCheck is one JSON Schema contains assertion on an array-shaped
// node: at least Min (and at most Max, when Max ≥ 0; -1 means unbounded)
// of the array's items validate against Child.
type ContainsCheck struct {
	Child *RunType `json:"child"`
	Min   float64  `json:"min"`
	Max   float64  `json:"max"`
}

// UnevaluatedCheck is the evaluated-member sweep. Value is what a member
// nobody evaluated must satisfy; nil is the `false` reading, where nothing
// does.
type UnevaluatedCheck struct {
	Value   *RunType       `json:"value,omitempty"`
	Keys    []string       `json:"keys,omitempty"`
	Sources []string       `json:"sources,omitempty"`
	Groups  []*UnevalGroup `json:"groups,omitempty"`
}

// UnevalGroup is one conditional contribution. Exactly one guard is set: When
// is a subschema whose SUCCESS fires the group, WhenNot the same subschema
// failing (the `else` side), WhenKey a key's mere presence
// (dependentSchemas). All marks a group evaluating EVERY key when it fires.
type UnevalGroup struct {
	When    *RunType `json:"when,omitempty"`
	WhenNot *RunType `json:"whenNot,omitempty"`
	WhenKey string   `json:"whenKey,omitempty"`
	Keys    []string `json:"keys,omitempty"`
	Sources []string `json:"sources,omitempty"`
	All     bool     `json:"all,omitempty"`
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

// Op constants for the wire protocol. Stable string values — the TS side
// references the same names.
const (
	// OpScanFiles walks every CallExpression in each requested file and
	// returns one Site per call whose resolved signature opts into
	// transformer injection (trailing `InjectRunTypeId<T>` parameter with a
	// concretely-bound T). When Request.IncludeRunTypes or
	// IncludeCacheSources is set, the response also carries a projection
	// scoped to Request.Files only — NOT to the cache's session-wide
	// contents. Callers that want the full in-memory cache use OpDump.
	OpScanFiles = "scanFiles"
	// OpDump returns the full cache contents: every RunType the resolver has
	// projected so far + every Site recorded. Used at end-of-build.
	OpDump = "dump"
	// OpSetSources replaces the resolver's in-memory source overlay AND
	// rebuilds the inferred Program against it. Sites are reset (their
	// byte offsets are tied to the previous source text). The structural
	// type cache survives across calls — same shape, same id — unless
	// reset is explicitly invoked.
	OpSetSources = "setSources"
	// OpReset wipes ALL resolver state: cache, sites, Program, checker,
	// and the in-memory overlay. Equivalent to throwing the Session away
	// and replacing it with a fresh one — the connection stays open. A
	// subsequent setSources is required before scanFiles will work.
	OpReset = "reset"
	// OpTsCompile runs the embedded tsgo through bind + typecheck + emit
	// on the resolver's current source overlay, returns the wall time in
	// the response's TsCompileMs field, and discards the emit output.
	// Does NOT walk markers, does NOT render any ts-runtypes cache
	// modules — it's the pure-TypeScript baseline measurement used by
	// the bench orchestrators to show "what would tsc cost" next to the
	// existing scanFiles latency. Caller seeds sources via OpSetSources
	// first (same precondition as OpScanFiles).
	OpTsCompile = "tsCompile"
	// OpTransform runs the FULL per-file transform in Go: it scans each
	// requested file (same machinery as OpScanFiles), then applies the
	// call-site rewrites, pure-fn replacements, and the deduped import block,
	// and generates a source map — returning one TransformResult per file in
	// Response.Transformed. This is the compiler-driven path that lets the Vite
	// plugin (and a plugin-free CLI) skip the JS-side rewrite entirely. Source
	// text is read from the resolver's Program/overlay (the authoritative bytes
	// the byte-offsets index), keyed by file — seed it via OpSetSources exactly
	// as OpScanFiles requires.
	OpTransform = "transform"
	// OpGenerate runs the full-program entry-module collection (the same
	// machinery as OpDump) then WRITES each module to
	// <outDir>/types/<basename>.js on disk — write-only-on-change, pruning
	// stale generated files — instead of returning the sources on the wire.
	// The root is session config (resolver.Options.GenDir > tsconfig genDir >
	// inferred <srcDir>/__runtypes) and comes back on Response.OutDir.
	// Response.Generated is the manifest of live module basenames. This is the
	// filesystem-output path that replaces virtual modules; the transform op
	// injects relative imports to these real files when the session sets
	// Options.TransformRelative.
	OpGenerate = "generate"
	// OpEnrich scaffolds / reconciles the enrichment mirror files — the daemon face
	// of the CLI `enrich` verb, so a bundler plugin can drive the scaffold + sync
	// pass over the warm connection instead of spawning. It returns the computed
	// mirror CONTENT (Response.EnrichFiles) and NEVER writes; EnrichNoEmit=true
	// returns Diagnostics only. Shares enrichgen.Plan + mirror.Scaffold/Reconcile
	// with the CLI verb, so the two produce byte-identical mirrors.
	OpEnrich = "enrich"
)

// Request is the union of all query operations (see resolver/dispatch).
//
// THE WIRE CARRIES EVENTS; THE SESSION CARRIES CONFIG. Every field below is
// one of exactly three kinds, and a new field must justify itself as one of
// them — anything session-constant belongs in resolver.Options, loaded once
// from a `serve` flag at spawn (respawn-safe for free, since the client
// replays the same argv):
//
//   - EVENTS — what happened / what is being asked: Op, Files, Sources.
//   - PAYLOAD SELECTORS — how much of THIS request's answer to ship back:
//     IncludeRunTypes, IncludeEntryModules, IncludeMetrics.
//   - LANE SELECTORS — which walker/emit mode THIS request runs:
//     CheckEnrich, IncludeRtDiagnostics, EmitEdits.
//
// Config that used to ride here and now lives in resolver.Options: the
// output root (Options.GenDir, via resolveOutDir), files-mode import
// relativization (Options.TransformRelative), the source-map trim
// (Options.OmitSourcesContent), and the whole OpEnrich block (families,
// locales, update/no-emit).
//
// Files carries the op's file input — every file the caller wants scanned
// (scanFiles), rewritten (transform), or enrichment-checked (enrich). The
// response's Sites carries entries for every listed file (each tagged with
// .File), and IncludeRunTypes / IncludeEntryModules scope their payload to
// **this request's Files only**, not to any session-wide accumulation.
// Callers that want the whole in-memory cache call OpDump.
type Request struct {
	Op              string            `json:"op"`
	Files           []string          `json:"files,omitempty"`
	Sources         map[string]string `json:"sources,omitempty"`
	IncludeRunTypes bool              `json:"includeRunTypes,omitempty"`
	// IncludeEntryModules opts a scanFiles response into the per-entry
	// virtual-module payload (Response.EntryModules), scoped to this
	// request's Files. OpDump always carries the full session's modules.
	IncludeEntryModules bool `json:"includeEntryModules,omitempty"`
	// IncludeMetrics opts the response into the Metrics block: tsgo
	// extendedDiagnostics-style checker counters, per-phase wall times,
	// and Go memory deltas. Zero measurement cost when unset — the
	// dispatcher skips every ReadMemStats / stopwatch entirely.
	IncludeMetrics bool `json:"includeMetrics,omitempty"`
	// CheckEnrich opts a scanFiles response into the enrichment-health pass
	// over this request's Files: tag hygiene (@todo scaffolds, @rtOrphan /
	// @rtOrphanChild carcasses), FriendlyText/MockData content validity, and
	// breadcrumb drift, appended to Response.Diagnostics as FamilyEnrich
	// entries. Off by default so the rewrite pipeline pays nothing; the
	// ts-runtypes-devtools lint plugin is the consumer.
	CheckEnrich bool `json:"checkEnrich,omitempty"`
	// IncludeRtDiagnostics opts a scanFiles response into the RunType-family
	// diagnostics (VL010, PJ001, … — emitted while RENDERING the demanded
	// entries) WITHOUT shipping the entry modules on the wire. The render
	// runs exactly as IncludeEntryModules would; only the module payload is
	// dropped. Lint-plugin use: one scan returns the full diagnostic picture
	// a build would surface. Implied by IncludeEntryModules.
	IncludeRtDiagnostics bool `json:"includeRtDiagnostics,omitempty"`
	// EmitEdits switches OpTransform from 'go' mode (full rewritten Code + Map
	// per file) to 'edits' mode: each TransformResult carries ImportBlock +
	// Edits + SourceHash for the FE to apply itself, and Code/Map are left
	// empty. A per-request knob (not a persistent flag) — it changes only the
	// wire shape, never the artifacts, so it must never fold into any disk-cache
	// fingerprint. Ignored by every op other than OpTransform.
	EmitEdits bool `json:"emitEdits,omitempty"`
	// OpEnrich carries NO fields of its own beyond Files: the wire carries the
	// EVENT (which files changed; empty = whole program) and the session carries
	// the CONFIG — families, i18n locales, and the output root all ride
	// resolver.Options, loaded once at spawn (the serve --gen-dir / --enrich-*
	// flags, defaulting from the tsconfig plugin entry). The daemon owns the
	// (demanded type name → source file) mapping the caller cannot do itself.
}

// Metrics is the per-op performance block, populated only when
// Request.IncludeMetrics is set. The first group mirrors tsc's
// `--extendedDiagnostics` counters, read straight off the tsgo Program
// (the shim exposes typescript-go's exported stats methods); they are
// post-op absolutes — tsgo checks lazily, so the numbers reflect all
// checker work forced so far in this Program's lifetime. The second
// group is wall time per pipeline phase of THIS op. The third group is
// Go runtime memory: Alloc*/Mallocs/NumGC are deltas over the op
// (churn), HeapAlloc/HeapInuse are post-op snapshots (retention).
type Metrics struct {
	Files          int `json:"files,omitempty"`
	Lines          int `json:"lines,omitempty"`
	Identifiers    int `json:"identifiers,omitempty"`
	Symbols        int `json:"symbols,omitempty"`
	Types          int `json:"types,omitempty"`
	Instantiations int `json:"instantiations,omitempty"`

	SetSourcesMs float64 `json:"setSourcesMs,omitempty"`
	MarkerScanMs float64 `json:"markerScanMs,omitempty"`
	PureFnsMs    float64 `json:"pureFnsMs,omitempty"`
	// PrepMs is the per-dispatch response prep: added-flag passes,
	// provenance line/col conversion, and the full ref-table build.
	PrepMs       float64            `json:"prepMs,omitempty"`
	ScopedDumpMs float64            `json:"scopedDumpMs,omitempty"`
	RenderMs     map[string]float64 `json:"renderMs,omitempty"`
	TotalMs      float64            `json:"totalMs,omitempty"`

	AllocBytes uint64 `json:"allocBytes,omitempty"`
	Mallocs    uint64 `json:"mallocs,omitempty"`
	NumGC      uint32 `json:"numGC,omitempty"`
	HeapAlloc  uint64 `json:"heapAlloc,omitempty"`
	HeapInuse  uint64 `json:"heapInuse,omitempty"`

	CacheNodes int `json:"cacheNodes,omitempty"`
}

// Response is returned per request. ID is the hash key into the shared
// dedup table. To distinguish "no id" from an empty string without polluting
// every payload, callers omit the field via HasID=false; we serialise via
// MarshalJSON below so JSON consumers see the field only when it's set.
//
// OK is a simple acknowledgement for ops that don't return data
// (setSources / resetCache). Emitted only when set so other ops stay tidy.
type Response struct {
	ID    string     `json:"-"`
	HasID bool       `json:"-"`
	OK    bool       `json:"-"`
	Added []*RunType `json:"added,omitempty"`
	// AddedRunTypes is true when this scanFiles call interned at least one
	// new RunType into the cache. The Vite plugin reads it from
	// handleHotUpdate to decide whether the runTypes cache module needs
	// invalidating after a user-file change.
	AddedRunTypes bool `json:"addedRunTypes,omitempty"`
	// AddedValidate is true when at least one of the newly-interned RunTypes
	// is supported by the Validate emitter — i.e. the validate cache module
	// would render at least one new entry. Set independently of
	// AddedRunTypes so cache-by-cache invalidation stays surgical.
	AddedValidate bool `json:"addedValidate,omitempty"`
	// AddedValidationErrors mirrors AddedValidate but for the ValidationErrors emitter —
	// true when at least one newly-interned RunType has a supported
	// emitTypeErrors arm. Lets the Vite plugin's handleHotUpdate
	// invalidate the validationErrors cache module independently of the
	// validate / runTypes modules.
	AddedValidationErrors bool `json:"addedValidationErrors,omitempty"`
	// AddedPrepareForJson / AddedRestoreFromJson mirror AddedValidate for
	// the JSON serializer pair. True when at least one newly-interned
	// RunType has a supported emit arm in the corresponding emitter.
	AddedPrepareForJson  bool `json:"addedPrepareForJson,omitempty"`
	AddedRestoreFromJson bool `json:"addedRestoreFromJson,omitempty"`
	// AddedStringifyJson mirrors AddedPrepareForJson for the
	// stringifyJson emitter — single-pass JSON.stringify that walks
	// the type rather than `v`. Set per emitter so the Vite plugin
	// invalidates the stringifyJson cache module independently.
	AddedStringifyJson bool `json:"addedStringifyJson,omitempty"`
	// AddedPrepareForJsonSafe mirrors AddedPrepareForJson for the safe-encode
	// family — non-mutating sibling that strips undeclared properties and
	// returns a new value. Pairs with the existing RestoreFromJson decoder
	// (wire format identical to prepareForJson + JSON.stringify).
	AddedPrepareForJsonSafe bool `json:"addedPrepareForJsonSafe,omitempty"`
	// AddedHasUnknownKeys / AddedUnknownKeyErrors / AddedCloneExactShape
	// mirror AddedValidate for the unknown-keys family. Set per emitter so
	// the Vite plugin invalidates each cache module independently on
	// user-file changes. (The mutating strip/toUndefined public families
	// were replaced by cloneExactShape; their flags went with them.)
	AddedHasUnknownKeys   bool `json:"addedHasUnknownKeys,omitempty"`
	AddedUnknownKeyErrors bool `json:"addedUnknownKeyErrors,omitempty"`
	AddedCloneExactShape  bool `json:"addedCloneExactShape,omitempty"`
	// AddedUnknownKeysToUndefinedWire — the decoder-internal ukuWire family
	// (the `strip` decode strategy's pre-pass).
	AddedUnknownKeysToUndefinedWire bool `json:"addedUnknownKeysToUndefinedWire,omitempty"`
	// AddedToBinary / AddedFromBinary mirror AddedPrepareForJson for the
	// binary serializer pair. True when at least one newly-interned
	// RunType has a supported emit arm in the corresponding emitter.
	AddedToBinary   bool `json:"addedToBinary,omitempty"`
	AddedFromBinary bool `json:"addedFromBinary,omitempty"`
	// AddedFormatTransform mirrors AddedValidate for the `format` transform emitter —
	// true when a newly-interned RunType carries a value-transforming
	// format (string transform / domain/ip/url lowercasing).
	AddedFormatTransform bool `json:"addedFormatTransform,omitempty"`
	// AddedPureFns is true when the scan introduced (or modified) at
	// least one pure-fn entry across the request's files — checked
	// against the resolver's session-wide bodyHash index.
	AddedPureFns bool          `json:"addedPureFns,omitempty"`
	Sites        []Site        `json:"sites,omitempty"`
	Replacements []Replacement `json:"replacements,omitempty"`
	// PureFnSites is the structured pure-fn build report — one record per
	// generated pure-fn entry — populated on OpGenerate (whole program) and
	// OpScanFiles (the rescanned files' delta) when the resolver's pure-fn
	// report is enabled. Empty otherwise. See PureFnSite.
	PureFnSites []PureFnSite `json:"pureFnSites,omitempty"`
	RunTypes    []*RunType   `json:"runTypes,omitempty"`
	// EntryModules carries one rendered ES-module source per cache entry,
	// keyed by module BASENAME (the `<basename>` of `rtmod:/<basename>.js`
	// — the cache key for runtype / type-fn entries, the `pf/<ns>/<fn>`
	// encoding for pure fns). The Vite plugin serves these verbatim from its
	// virtual-module load hook. Populated on OpDump (full session) and on
	// OpScanFiles when Request.IncludeEntryModules is set (scoped to the
	// request's Files).
	EntryModules map[string]string `json:"entryModules,omitempty"`
	// Generated is the manifest of live module basenames written under
	// <OutDir>/types by OpGenerate (the current build's filesystem output).
	Generated []string `json:"generated,omitempty"`
	// SiteFiles is OpGenerate's sorted unique list of source files (program
	// paths, exactly as the whole-program scan recorded them) carrying at
	// least one marker site. The plugin gates its per-file transform on this
	// set, so call sites of wrapper functions declared in OTHER packages
	// (node_modules included) rewrite with zero configuration — no textual
	// import sniffing required. Emitted via the hand-rolled MarshalJSON
	// below (the struct tag alone doesn't put it on the wire).
	SiteFiles []string `json:"siteFiles,omitempty"`
	// EnrichFiles is OpEnrich's computed enrichment mirror files (path + desired
	// CONTENT + Added + Kind). The daemon never writes — the caller (a bundler
	// plugin) writes them under its own HMR-suppression window. Emitted via the
	// hand-rolled MarshalJSON below (the struct tag alone doesn't put it on the wire).
	EnrichFiles []EnrichFile `json:"enrichFiles,omitempty"`
	// OutDir is the SESSION-RESOLVED RunTypes output root OpGenerate wrote to
	// (Options.GenDir > tsconfig genDir > inferred). This echo stays even though
	// the root is no longer a request field: when neither override is set the
	// resolver infers <srcDir>/__runtypes from the tsconfig (rootDir →
	// common-ancestor of the program's files → baseUrl → cwd), which the
	// dependency-free plugin cannot compute for itself but still needs — to
	// write .gitignore/.gitkeep and to suppress HMR under the enriched dir.
	// Together with FailOnError this is the sanctioned resolved-config
	// server→client echo channel.
	OutDir string `json:"outDir,omitempty"`
	// FailOnError echoes the tsconfig plugin's failOnError on OpGenerate (nil
	// when the tsconfig sets none) so the dependency-free host can honor a
	// tsconfig-only setting; the plugin adopts it as the halt default (its own
	// option wins, then this echo, then the built-in true). Emitted via the
	// hand-rolled MarshalJSON below.
	FailOnError *bool `json:"failOnError,omitempty"`
	// Transformed carries one TransformResult per file for OpTransform: the
	// fully rewritten source + its source map (+ the cache modules the file now
	// imports). Keyed by file path, scoped to the request's Files.
	Transformed map[string]TransformResult `json:"transformed,omitempty"`
	// Diagnostics carries every non-fatal diagnostic the Go binary
	// emits — pure-fn extractor (PFE9xxx), marker scanner (MKRxxx),
	// RT compiler (IT/TE/PJ/…/FB) — through one wire channel. The
	// Family discriminator inside each entry tells the consumer which
	// subsystem produced it; the Code is the stable identifier and
	// Severity classifies impact. Vite plugin re-emits each via
	// `this.warn(diagnostics.FormatTsc(d))` so VS Code's $tsc problem matcher
	// picks them up. Schema mirrors the LSP Diagnostic shape.
	Diagnostics []diagnostics.Diagnostic `json:"diagnostics,omitempty"`
	// TsCompileMs is populated by OpTsCompile only. Wall time of the
	// tsgo bind + typecheck + Emit() pass on the resolver's current
	// source overlay, in milliseconds. Zero for every other op.
	TsCompileMs float64 `json:"tsCompileMs,omitempty"`
	// Metrics is the per-op performance block. Nil (omitted from the
	// wire) unless the request set IncludeMetrics.
	Metrics *Metrics `json:"metrics,omitempty"`
	Error   string   `json:"error,omitempty"`
}

// Site records one transformer-injection point. Pos is the byte offset of
// the closing `)` of the call expression — the patcher inserts at that
// offset. ParamIndex is the 0-based slot the injected id occupies in the
// call's argument list; the runtime helper reads from that slot. ArgsCount
// is the number of arguments the user already wrote — when it's less than
// ParamIndex the patcher pads with `undefined` so the id lands in the
// right slot.
type Site struct {
	File       string `json:"file"`
	Pos        int    `json:"pos"`
	ID         string `json:"id"`
	ParamIndex int    `json:"paramIndex,omitempty"`
	ArgsCount  int    `json:"argsCount,omitempty"`
	// FnId is the value the transformer injects as the 2nd tuple element for a
	// createX call site routed through the InjectTypeFnArgs<T, Fn> marker (the
	// readable family/variant token today; an opaque fn hash after the hashed-id
	// migration). Empty for reflection-only InjectRunTypeId sites (getRunTypeId /
	// builders), which inject the bare id string.
	FnId string `json:"fnId,omitempty"`
	// FnIds carries every fnId a MULTI-FUNCTION createX site injects when its
	// trailing InjectTypeFnArgs<T, F1, F2, …> marker names more than one
	// function family (e.g. createStandardSchema's <T,'val','verr'>). The
	// rewrite injects an ARRAY of entry-tuple bindings at the single ParamIndex
	// in this order. Present only when len > 1; single-fn / reflection sites
	// leave it nil and carry the lone value in FnId (the byte-stable 1-fn wire).
	// FnId mirrors FnIds[0] when both are set.
	FnIds []string `json:"fnIds,omitempty"`
	// Demand is the structured set of cache entries this createX site requires,
	// computed by the scanner from the operation registry. The emitter renders
	// from this directly rather than reverse-parsing FnId — a hash isn't
	// reversible. One entry for a simple family / it-te variant; several for a
	// composite JSON strategy. Empty for reflection-only sites.
	Demand []SiteDemand `json:"demand,omitempty"`
	// TrailingComma is true when the call's own argument list was written with
	// a trailing comma (e.g. a formatter-wrapped value-first marker call). The
	// TS-side injector splices the binding WITHOUT a leading comma in that case
	// — otherwise the pre-existing comma plus the injected `, …` produce an
	// empty argument `f(a, , …)`, which is invalid JS.
	TrailingComma bool `json:"trailingComma,omitempty"`
	// Module, when non-empty, is the bundle-module BASENAME this site's entry
	// rides in (allSingle module mode): the rewrite imports the binding from
	// `rtmod:/<Module>.js` instead of the entry's own module — the clause
	// shape is identical either way (export name == the binding). Empty in
	// default/allModules mode. Derived statically from mode + site shape, so
	// it is present on every scanFiles response — including the plain
	// transform path that skips entry-module collection.
	Module string `json:"module,omitempty"`
	// MockSeed is the literal `mock.seed` hint read from a CompTimeHints
	// options slot (createMockDataFn), as canonical decimal text; "" when the
	// site carries none (no options, dynamic bag, or non-numeric seed). It
	// seeds the generated pattern mockSample pools for the types this site
	// demands. Resolver-internal — never serialized: the JS host has no use
	// for it and the wire stays byte-stable.
	MockSeed string `json:"-"`
}

// SiteDemand is one cache entry a createX site requires: the family + variant to
// render plus the fnHash that entry is keyed by. FamilyTag/VariantSuffix/Options
// drive the emitter's rendering; FnHash names the entry once the hashed-id
// migration lands (carried forward now).
type SiteDemand struct {
	FamilyTag     string   `json:"family"`
	VariantSuffix string   `json:"variant,omitempty"`
	Options       []string `json:"options,omitempty"`
	FnHash        string   `json:"fnHash,omitempty"`
	// RejectCircular flags the armed `{rejectCircularRefs: true}` fork of a
	// CircularGuarded family (validate / validationErrors / toBinary /
	// jsonEncoder). The emitter renders the inline circular-reference guard for
	// exactly these entries; it never rides a JSON primitive demand.
	RejectCircular bool `json:"rejectCircular,omitempty"`
}

// EnrichFile is one computed enrichment mirror file returned by OpEnrich: its
// absolute Path, the desired CONTENT (the daemon never writes — the caller writes
// it under its own HMR-suppression window), whether it is newly Added (no prior
// on-disk file), and its family Kind ("friendly" | "mock").
type EnrichFile struct {
	Path    string `json:"path"`
	Content string `json:"content"`
	Added   bool   `json:"added,omitempty"`
	Kind    string `json:"kind,omitempty"`
}

// PureFnSite is one generated pure-fn entry a build produced, reported in
// structured form for host tooling that relocates pure-fn bodies across bundles
// (mion's cross-bundle serverMapFrom transport is the motivating consumer). The
// record is SELF-CONTAINED — Code + ParamNames ride inline — precisely so a
// consumer never has to read the generated module files, which makes the shape
// stable across every moduleMode (per-entry pf modules vs the single pf bundle).
// Populated only when the resolver's pure-fn report is enabled (the
// `--pure-fn-report-wire` flag / `pureFnReport` project option); the normal rewrite
// pipeline pays nothing.
type PureFnSite struct {
	// File / Start / End are the registrar call site's factory-argument span
	// (byte offsets, exactly as the matching Replacement carries).
	File  string `json:"file"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	// Key is the registry key the entry is interned under: `rt::<hash>` for the
	// anonymous lane, `<ns>::<name>` for the named lane.
	Key string `json:"key"`
	// CalleeName is the identifier the site invoked — `registerAnonymousPureFn`,
	// a framework wrapper like `serverMapFrom` / `registerAcmePureFn`, or a
	// renamed import. CalleeModule is the nearest-package.json `"name"` of the
	// file that DECLARES the callee (or its ambient `declare module` name), so a
	// consumer can attribute a site to the framework that exposed the registrar
	// (e.g. `@mionjs/client`, `@acme/toolkit`) even through a wrapper-only file.
	CalleeName   string `json:"calleeName,omitempty"`
	CalleeModule string `json:"calleeModule,omitempty"`
	// Lane is "named" | "anonymous"; Form is "direct" (the arg IS the pure fn,
	// wrapped) | "factory" (the arg is a factory, emitted as-is).
	Lane string `json:"lane,omitempty"`
	Form string `json:"form,omitempty"`
	// Module is the BASENAME of the generated module this entry rides in: the
	// per-entry `pf/<ns>/<fn>` in default/allModules mode, or the single `pf`
	// bundle in allSingle — mirrors Site.Module. Provided for consumers that
	// want the layout linkage; the record stays usable without reading it.
	Module string `json:"module,omitempty"`
	// ParamNames / Code are the entry payload, emitMode-honoring (Code is empty
	// in an emitMode that ships no body string, matching the module render).
	// PureFnDependencies is the entry's direct pure-fn dep keys.
	ParamNames         []string `json:"paramNames,omitempty"`
	Code               string   `json:"code,omitempty"`
	PureFnDependencies []string `json:"pureFnDependencies,omitempty"`
}

// Replacement is a byte-range rewrite on a source file: replace the
// bytes [Start, End) with Text. Used by the pure-fn extractor to swap
// the factory argument of every `registerPureFnFactory(pureFnId,
// factory)` call for the pure fn's entry-module import binding, so the
// canonical fn body lives only in the emitted entry module (no
// duplication in the user bundle).
type Replacement struct {
	File  string `json:"file"`
	Start int    `json:"start"`
	End   int    `json:"end"`
	Text  string `json:"text"`
	// ImportFrom, when non-empty, is the virtual-module specifier the Vite
	// plugin must import for the substituted expression to resolve — e.g.
	// `rtmod:/pf/rt/foo.js`. Text IS the module's export name (every
	// entry exports under its binding name), so the plugin imports `{<Text>}`
	// directly. Empty for plain text substitutions.
	ImportFrom string `json:"importFrom,omitempty"`
}

// TransformResult is the per-file output of OpTransform. Two wire shapes,
// selected by Request.EmitEdits:
//
//   - 'go' mode (EmitEdits false, the default): Code is the fully rewritten
//     source and Map its source map — the compiler-driven path where Go applies
//     the rewrite and the plugin plumbs {code, map} straight to the bundler.
//   - 'edits' mode (EmitEdits true): Code/Map are empty and instead ImportBlock
//   - Edits carry the raw edit list for the FE to apply itself (lighter wire:
//     O(sites) instead of the whole rewritten file + dense map). SourceHash is
//     the consistency guard — the applier hashes the bundler-supplied source and
//     falls back to a source upload on mismatch (see docs/ARCHITECTURE.md →
//     Rewrite mechanics).
//
// EmittedModules is the cache-module basenames the rewritten file now imports
// (so a consumer emitting modules to disk knows which were referenced).
type TransformResult struct {
	Code string     `json:"code,omitempty"`
	Map  *SourceMap `json:"map,omitempty"`
	// ImportBlock is the deduped import statement block the rewrite prepends at
	// offset 0 (single physical line, already relativized to <outDir>/types when
	// files-mode is in effect). Empty when the file needs no injected imports.
	// 'edits' mode only; the FE prepends it verbatim.
	ImportBlock string `json:"importBlock,omitempty"`
	// Edits is the flat point/span edit list (NOT including ImportBlock), in
	// UTF-16 CODE-UNIT offsets against the ORIGINAL source — the FE applier
	// indexes JS strings natively, so Go converts every byte offset via
	// makeByteToChar first. 'edits' mode only.
	Edits []Edit `json:"edits,omitempty"`
	// SourceHash is a non-cryptographic FNV-1a/32 hash of the exact source bytes
	// the Edits offsets index (the resolver's Program/overlay view). The FE
	// applier hashes the bundler-supplied source; a mismatch means an upstream
	// pre-plugin edited the source out from under us, so the applier re-uploads
	// the source (setSources) and re-requests rather than misplacing every edit.
	// 'edits' mode only.
	SourceHash     string   `json:"sourceHash,omitempty"`
	EmittedModules []string `json:"emittedModules,omitempty"`
}

// Edit is one point insertion (Start == End) or span replacement (Start < End)
// against the original source, in UTF-16 CODE-UNIT offsets. The wire unit is a
// hard contract: UTF-16 code units, never bytes, never runes — astral-plane
// characters make the three diverge. Used only by 'edits'-mode OpTransform;
// the resolver's own byte offsets (Site.Pos, Replacement.Start/End) are
// converted to UTF-16 before they become Edits.
type Edit struct {
	Start int    `json:"start"`
	End   int    `json:"end"`
	Text  string `json:"text"`
}

// SourceMap is a standard source-map v3 object — the plain shape Vite/Rollup
// accept back from a transform. Mirrors the EditBuffer's output so the
// Go-generated map is byte-for-byte interchangeable with the old JS one.
type SourceMap struct {
	Version        int       `json:"version"`
	Sources        []string  `json:"sources"`
	SourcesContent []*string `json:"sourcesContent"`
	Names          []string  `json:"names"`
	Mappings       string    `json:"mappings"`
}

// Dump is the build-end manifest written to runtypes-cache.json.
type Dump struct {
	RunTypes []*RunType `json:"runTypes"`
	Sites    []Site     `json:"sites"`
}

// WriteJSON writes the dump as pretty-printed JSON. Refs in child slots
// stay as `{kind: -1, id: "<hash>"}` sentinels — the consumer is
// responsible for re-knotting if it doesn't use the generated TS module.
func (dump Dump) WriteJSON(writer io.Writer) error {
	encoder := json.NewEncoder(writer)
	encoder.SetIndent("", "  ")
	return encoder.Encode(dump)
}

// responseAddedFlags is the wire definition of the per-family added-flag
// Response fields. Hand-written on purpose: the wire keys are NOT derivable
// from constants.CacheModules ("runTypes" maps to addedRunTypes), and this
// table IS the wire contract.
var responseAddedFlags = []struct {
	key string
	get func(*Response) bool
}{
	{"addedRunTypes", func(response *Response) bool { return response.AddedRunTypes }},
	{"addedValidate", func(response *Response) bool { return response.AddedValidate }},
	{"addedValidationErrors", func(response *Response) bool { return response.AddedValidationErrors }},
	{"addedPrepareForJson", func(response *Response) bool { return response.AddedPrepareForJson }},
	{"addedRestoreFromJson", func(response *Response) bool { return response.AddedRestoreFromJson }},
	{"addedStringifyJson", func(response *Response) bool { return response.AddedStringifyJson }},
	{"addedPrepareForJsonSafe", func(response *Response) bool { return response.AddedPrepareForJsonSafe }},
	{"addedHasUnknownKeys", func(response *Response) bool { return response.AddedHasUnknownKeys }},
	{"addedUnknownKeyErrors", func(response *Response) bool { return response.AddedUnknownKeyErrors }},
	{"addedCloneExactShape", func(response *Response) bool { return response.AddedCloneExactShape }},
	{"addedUnknownKeysToUndefinedWire", func(response *Response) bool { return response.AddedUnknownKeysToUndefinedWire }},
	{"addedToBinary", func(response *Response) bool { return response.AddedToBinary }},
	{"addedFromBinary", func(response *Response) bool { return response.AddedFromBinary }},
	{"addedFormatTransform", func(response *Response) bool { return response.AddedFormatTransform }},
	{"addedPureFns", func(response *Response) bool { return response.AddedPureFns }},
}

// MarshalJSON serialises Response. ID is emitted only when HasID is true so
// dump responses (which don't resolve a single id) don't carry a misleading "".
// Map-built on purpose: encoding/json sorts map keys, so output bytes are
// stable regardless of fill order.
func (response Response) MarshalJSON() ([]byte, error) {
	out := make(map[string]any, 8)
	if response.HasID {
		out["id"] = response.ID
	}
	if response.OK {
		out["ok"] = true
	}
	if len(response.Added) > 0 {
		out["added"] = response.Added
	}
	for _, flag := range responseAddedFlags {
		if flag.get(&response) {
			out[flag.key] = true
		}
	}
	if len(response.Sites) > 0 {
		out["sites"] = response.Sites
	}
	if len(response.Replacements) > 0 {
		out["replacements"] = response.Replacements
	}
	if len(response.PureFnSites) > 0 {
		out["pureFnSites"] = response.PureFnSites
	}
	if len(response.RunTypes) > 0 {
		out["runTypes"] = response.RunTypes
	}
	if len(response.EntryModules) > 0 {
		out["entryModules"] = response.EntryModules
	}
	if len(response.Generated) > 0 {
		out["generated"] = response.Generated
	}
	if len(response.SiteFiles) > 0 {
		out["siteFiles"] = response.SiteFiles
	}
	if len(response.EnrichFiles) > 0 {
		out["enrichFiles"] = response.EnrichFiles
	}
	if response.OutDir != "" {
		out["outDir"] = response.OutDir
	}
	if response.FailOnError != nil {
		out["failOnError"] = *response.FailOnError
	}
	if len(response.Transformed) > 0 {
		out["transformed"] = response.Transformed
	}
	if len(response.Diagnostics) > 0 {
		out["diagnostics"] = response.Diagnostics
	}
	if response.TsCompileMs > 0 {
		out["tsCompileMs"] = response.TsCompileMs
	}
	if response.Metrics != nil {
		out["metrics"] = response.Metrics
	}
	if response.Error != "" {
		out["error"] = response.Error
	}
	return jsonMarshal(out)
}

// PureFnDep identifies a pure-function dependency of a RT-compiled
// function. FilePath is the absolute path of the source file where
// registerPureFnFactory("<Namespace>::<FunctionName>", ...) is invoked.
// The walker uses FilePath at compile time to assert the dependency
// actually exists in source (Go-side AST integrity check); it does
// not reach the emitted JS — the wire shape stays the flat
// "namespace::fnName" string array that the JS-side rtUtils
// consumes today.
type PureFnDep struct {
	Namespace    string
	FunctionName string
	FilePath     string
}
