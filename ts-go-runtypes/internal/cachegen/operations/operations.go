// Package operations is the single source of truth for every RT "operation"
// the transformer can emit a cache entry for, and the one place the opaque
// function hash (fnHash) is computed.
//
// An operation is a named unit of work the backend can render for a given type
// (validate validation, prepareForJson transform, a per-strategy JSON encoder,
// …). Each operation has a canonical Name, the emitted-entry FamilyTag, and the
// compile-time option Axis that refines it. The scanner resolves a createX call
// site to its operation (+ the call-site comptime args) and injects
// fnHash(operation, args); the emitter names cache entries and cross-family
// references with the SAME fnHash. Routing both halves through this package is
// what guarantees they agree — see fnhash.go.
//
// This replaces the hand-maintained family-tag / variant-suffix / JSON-strategy
// token scheme (constants.CompFns, DemandsForFnId, …): the readable token is
// gone, the demand rides structured on protocol.Site, and the cache key is a
// pure hash. The registry below is the superset of the old CompFns map — it
// also enumerates the internal-only primitives (prepareForJson, restoreFromJson,
// …) that have no public createX function but are reachable as JSON-composite
// dependencies or cross-family edges, because the emitter must hash THOSE too.
package operations

import "strings"

// Axis classifies the compile-time option axis that refines an operation's
// fnHash beyond its bare name. Mirrors the old constants.CompFnAxis.
type Axis int

const (
	// AxisNone — the operation takes no compile-time option; its canonical key
	// is exactly its Name.
	AxisNone Axis = iota
	// AxisValidateOptions — refined by the ValidateOptions bag (validate / validationErrors).
	AxisValidateOptions
	// AxisJsonStrategy — refined by the JSON strategy token (jsonEncoder /
	// jsonDecoder); the operation is composite (one emitted entry per strategy).
	AxisJsonStrategy
	// AxisHasUnknownKeysOptions — refined by the HasUnknownKeysOptions bag
	// (hasUnknownKeys's `runsAfterValidation`).
	AxisHasUnknownKeysOptions
)

// Operation describes one renderable RT operation.
type Operation struct {
	// Name is the canonical operation name and the stable hash input — e.g.
	// "validate", "prepareForJsonMutate", "jsonEncoder". NEVER change a Name without
	// understanding that it changes every fnHash (and thus invalidates caches).
	Name string
	// FamilyTag is the emitted-entry family tag (the disk-cache basename and the
	// inner-fn family). Empty for composite operations (AxisJsonStrategy), whose
	// per-strategy family tags live in constants.CacheModules.
	FamilyTag string
	// Axis is the compile-time option axis refining this operation.
	Axis Axis
	// Public reports whether the operation is user-recoverable via the
	// InjectTypeFnArgs<T, Fn> marker — either through a dedicated createX factory
	// (validate / jsonEncoder / …) or the generic getRTFunction resolver (the
	// JSON prepare/restore primitives). Only genuinely private plumbing stays
	// false. Gates the overrideX path (a Public op may be overridden).
	Public bool
	// FnKey is the Fn token the InjectTypeFnArgs marker carries for a public
	// operation (e.g. "val", "jsonEncoder", "pjs"). Empty only for operations no
	// marker names.
	FnKey string
	// DefaultStrategy is the strategy applied when an AxisJsonStrategy call omits
	// the options literal. Empty for non-JSON operations.
	DefaultStrategy string
	// Strategies is the full set of valid strategy tokens for an AxisJsonStrategy
	// operation. Empty otherwise. Drives the collision-guard enumeration.
	Strategies []string
	// CircularGuarded marks an operation whose runtime factory can inline the
	// circular-reference guard: validate, validationErrors, toBinary, jsonEncoder.
	// When a call site arms `{rejectCircularRefs: true}` on one of these, the
	// option folds ORTHOGONALLY into the fnHash (circularCanonicalSuffix) — an
	// armed factory and a plain one for the same T compile to distinct entries,
	// pay-for-use exactly like noLiterals. The suffix is independent of the
	// operation's Axis (it applies across the validate-options, json-strategy, and
	// none axes uniformly), so it is a bool here rather than a fourth Axis value.
	CircularGuarded bool
}

// registry is the complete operation set: the createX-backed operations (plain
// and fused validators included) plus the 7 JSON value-level primitives the
// composites and cross-family edges reference.
// All are Public (marker-recoverable) — the primitives via getRTFunction rather
// than a dedicated factory. Order is not load-bearing (keyed by Name / FnKey).
var registry = []Operation{
	// Public — validators (ValidateOptions axis). Both guard circular refs.
	{Name: "validate", FamilyTag: "val", Axis: AxisValidateOptions, Public: true, FnKey: "validate", CircularGuarded: true},
	{Name: "validationErrors", FamilyTag: "verr", Axis: AxisValidateOptions, Public: true, FnKey: "validationErrors", CircularGuarded: true},

	// Public — the FUSED validators (`{checkUnknowns: true}` on createValidateFn /
	// createGetValidationErrorsFn). Each renders the same body its plain twin does
	// PLUS the unknown-key check spliced into every object-ish node, so one walk of
	// the value answers "valid AND free of undeclared keys" instead of running
	// validate and hasUnknownKeys back to back.
	//
	// Deliberately separate OPERATIONS rather than a ValidateOptions variant of
	// validate/validationErrors: a variant is root-scoped (renderEntryWithDeps keeps
	// the plain family's InnerPrefix, so children dispatch to plain entries), is
	// never disk-cached, and skips overrides. A family renders its own transitive
	// subtree, caches under its own tag, and honours overrides.
	//
	// The call site's marker still says 'val' / 'verr'; the scanner swaps the
	// operation when it reads `checkUnknowns` (see resolver/scan.go computeSiteFn),
	// so no marker type changes. They keep the ValidateOptions axis (noLiterals /
	// numberMode / … apply unchanged) and the circular guard.
	{Name: "validateStrict", FamilyTag: "vst", Axis: AxisValidateOptions, Public: true, FnKey: "validateStrict", CircularGuarded: true},
	{Name: "validationErrorsStrict", FamilyTag: "vest", Axis: AxisValidateOptions, Public: true, FnKey: "validationErrorsStrict", CircularGuarded: true},

	// Public — createParseFn: restore a JSON.parse output into the typed shape AND
	// check it, in ONE walk, throwing an RTParseError carrying the full report when
	// it does not match. Replaces `restore` + `validate` + `getValidationErrors`
	// run back to back.
	//
	// One operation PER STRATEGY rather than a strategy axis. The AxisJsonStrategy
	// arm in DemandFor assumes a COMPOSITE (it resolves JsonCompositeTag /
	// JsonStrategyFamilies), and variantKey keys entries off option NAMES with no
	// strategy slot — so a type-walking family with a strategy axis would need new
	// plumbing in both. Three operations need none: the scanner reads `strategy`
	// and picks one, exactly the flag-selects-an-operation route checkUnknowns
	// already uses.
	//
	// The three differ ONLY in which pieces their body composes, and so in how
	// undeclared keys are treated:
	//   - parse (loose, the DEFAULT): rj + val. Nothing rebuilt, extras kept. The
	//     cheapest shape, and what zod does — it strips only under `.strict()`.
	//   - parseStrip: ukuw + rj + val. The ukuw pre-pass blanks undeclared keys
	//     before restore walks the declared shape, the same two-step the `strip`
	//     JSON decoder uses.
	//   - parseFail: rj + vst. The fused validate{checkUnknowns} rejects a value
	//     carrying extras in ONE pass, so strict costs a single call like the rest.
	{Name: "parse", FamilyTag: "prs", Axis: AxisNone, Public: true, FnKey: "parse"},
	{Name: "parseStrip", FamilyTag: "prss", Axis: AxisNone, Public: true, FnKey: "parseStrip"},
	{Name: "parseFail", FamilyTag: "prsf", Axis: AxisNone, Public: true, FnKey: "parseFail"},

	// Public — hasUnknownKeys (HasUnknownKeysOptions axis: `runsAfterValidation`).
	// Stays as-is: the standalone predicate is still the right tool when the caller
	// already holds a validated value.
	{Name: "hasUnknownKeys", FamilyTag: "huk", Axis: AxisHasUnknownKeysOptions, Public: true, FnKey: "hasUnknownKeys"},

	// Public — option-less leaf families.
	{Name: "unknownKeyErrors", FamilyTag: "uke", Axis: AxisNone, Public: true, FnKey: "unknownKeyErrors"},
	{Name: "cloneExactShape", FamilyTag: "ces", Axis: AxisNone, Public: true, FnKey: "cloneExactShape"},
	{Name: "formatTransform", FamilyTag: "fmt", Axis: AxisNone, Public: true, FnKey: "formatTransform"},
	{Name: "toBinary", FamilyTag: "tb", Axis: AxisNone, Public: true, FnKey: "toBinary", CircularGuarded: true},
	{Name: "fromBinary", FamilyTag: "fb", Axis: AxisNone, Public: true, FnKey: "fromBinary"},
	// jsonSchema: the per-type JSON Schema DOCUMENT (schemadoc.RenderDocument
	// rendered at build time); the entry's fn returns the document object.
	{Name: "jsonSchema", FamilyTag: "jsc", Axis: AxisNone, Public: true, FnKey: "jsonSchema"},
	// classSerializerReg backs registerClassSerializer's trailing
	// InjectTypeFnArgs<T, 'csr'> marker: the emitted entry is a tiny name card
	// (its typeName carries the source class name, its fn returns it) so
	// registration reads the build-time class name WITHOUT demanding the type's
	// reflection graph. Public: false — the entry has no user-facing behavior to
	// override or recover.
	{Name: "classSerializerReg", FamilyTag: "csr", Axis: AxisNone, Public: false, FnKey: "classSerializerReg"},

	// Public — composite JSON encoder / decoder (JsonStrategy axis). FamilyTag is
	// empty; each strategy renders its own entry (per-strategy tags added to
	// constants.CacheModules in the JSON-composite slice).
	{
		Name: "jsonEncoder", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonEncoder", CircularGuarded: true,
		// `clone` is the default and is shape-derived: it builds a NEW value from
		// the declared type shape (never `{...v}`), so undeclared keys are dropped
		// for free — a clone is stripped by construction. That makes a separate
		// "strip" variant of clone (the old `stripClone`) redundant, and the
		// mutate-with-strip variant (`stripMutate`) unnecessary; both were removed.
		// `mutate` transforms in place (preserves undeclared keys, no allocation);
		// `direct` is the single-pass stringifyJson (always strips). `compact`
		// emits declared object props as a positional array (no key names on the
		// wire) and strips extras like `clone`; it pairs with the `compact` decoder.
		DefaultStrategy: "clone",
		Strategies:      []string{"clone", "mutate", "direct", "compact"},
	},
	{
		Name: "jsonDecoder", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonDecoder",
		// `compact` decodes the positional-array wire the compact ENCODER produces
		// (the key-based strip/preserve decoders can't read it), rebuilding the
		// declared object from positions.
		DefaultStrategy: "strip",
		Strategies:      []string{"strip", "preserve", "compact"},
	},

	// JSON value-level primitives — the per-strategy prepareForJson / restoreFromJson
	// building blocks the createJsonEncoderFn / createJsonDecoderFn composites wrap. They
	// have no dedicated createX factory, but a framework wrapper (mion) recovers any
	// of them by naming its FnKey in an InjectTypeFnArgs<T, '<tag>'> marker and
	// resolving the injected tuple through the generic getRTFunction resolver — so
	// they are Public (user-recoverable via the marker). Each FnKey equals its family
	// tag; there is no runtime hashing, so the resolver reads the plugin-injected
	// plain fnHash rather than reconstruct it (the same path the TEST-ONLY deserialize
	// twins deserializePrepareForJson / deserializeRestoreFromJson / … exercise).
	//   - pj (mutate prepare) / pjs (clone prepare): value → JSON-safe value.
	//   - rj (preserve restore): JSON-safe value → typed value.
	//   - rjs (strip restore): the decode mirror of pjs — rebuilds each object from the
	//     declared shape, so undeclared keys are DELETED rather than left in place. mion's
	//     `clone` strategy decodes with it; no createJsonDecoderFn strategy composes it.
	//   - sj (direct): single-pass value → JSON string (the `direct` encoder body).
	//   - ukuw: the strip decoder's unknown-keys-to-undefined wire pre-pass.
	{Name: "prepareForJsonMutate", FamilyTag: "pj", Axis: AxisNone, Public: true, FnKey: "prepareForJsonMutate"},
	{Name: "prepareForJsonClone", FamilyTag: "pjs", Axis: AxisNone, Public: true, FnKey: "prepareForJsonClone"},
	{Name: "restoreFromJson", FamilyTag: "rj", Axis: AxisNone, Public: true, FnKey: "restoreFromJson"},
	{Name: "restoreFromJsonStrip", FamilyTag: "rjs", Axis: AxisNone, Public: true, FnKey: "restoreFromJsonStrip"},
	{Name: "stringifyJson", FamilyTag: "sj", Axis: AxisNone, Public: true, FnKey: "stringifyJson"},
	{Name: "stripUnknownKeysWire", FamilyTag: "ukuw", Axis: AxisNone, Public: true, FnKey: "stripUnknownKeysWire"},
	// compactForJson / compactFromJson: the positional-tuple JSON round-trip pair
	// the `compact` strategy composes. compactForJson builds a NEW value emitting
	// declared object props as a positional array (no key names); compactFromJson
	// rebuilds the keyed object from positions. Recoverable via the marker like the
	// other value-level primitives (and reached as compact composite dependencies).
	{Name: "compactForJson", FamilyTag: "cj", Axis: AxisNone, Public: true, FnKey: "compactForJson"},
	{Name: "compactFromJson", FamilyTag: "cjr", Axis: AxisNone, Public: true, FnKey: "compactFromJson"},
}

var (
	byName    map[string]Operation
	byFnKey   map[string]Operation
	byFamilyT map[string]Operation
)

func init() {
	byName = make(map[string]Operation, len(registry))
	byFnKey = make(map[string]Operation)
	byFamilyT = make(map[string]Operation)
	for _, op := range registry {
		byName[op.Name] = op
		if op.FnKey != "" {
			byFnKey[op.FnKey] = op
		}
		if op.FamilyTag != "" {
			byFamilyT[op.FamilyTag] = op
		}
	}
	// Fail the build loudly if any two operation/option combinations hash to the
	// same fnHash at FnHashLen — the user's "closed system" guarantee. See
	// mustBeCollisionFree in fnhash.go.
	mustBeCollisionFree()
}

// All returns a copy of the full operation registry, in declaration order. Used
// by cmd/gen-fn-hashes to enumerate every operation + variant when emitting the
// TS fnHash table (the version-independent `fnKey → variant → fnHash` mirror the
// mion runtime's getFnHash resolves against).
func All() []Operation {
	out := make([]Operation, len(registry))
	copy(out, registry)
	return out
}

// ByName returns the operation with the given canonical name.
func ByName(name string) (Operation, bool) {
	op, ok := byName[name]
	return op, ok
}

// ByFnKey returns the public operation a createX call site's InjectTypeFnArgs Fn
// token names (e.g. "val", "jsonEncoder"). Used by the scanner.
func ByFnKey(fnKey string) (Operation, bool) {
	op, ok := byFnKey[fnKey]
	return op, ok
}

// ByFamilyTag returns the operation that emits entries under the given family
// tag (e.g. "pj"). Used by the emitter to recover an operation from a
// CacheModules family. Composite operations (empty FamilyTag) are not indexed.
func ByFamilyTag(tag string) (Operation, bool) {
	op, ok := byFamilyT[tag]
	return op, ok
}

// SuggestFnKey returns the marker token a mistyped one most likely meant, or ""
// when nothing is close. The common case by far is a RETIRED short tag: markers
// used to name a family by the tag it emits under (`'verr'`), so every stale
// call site hands us a tag that maps straight back to its operation. Anything
// else falls back to a bounded edit distance over the token vocabulary.
func SuggestFnKey(unknown string) string {
	if unknown == "" {
		return ""
	}
	if op, ok := byFamilyT[unknown]; ok && op.FnKey != "" {
		return op.FnKey
	}
	best, bestDistance := "", 0
	for fnKey := range byFnKey {
		distance := editDistance(strings.ToLower(unknown), strings.ToLower(fnKey))
		// Allow roughly a quarter of the token to be wrong, never more than 3 edits.
		budget := min(len(fnKey)/4+1, 3)
		if distance > budget {
			continue
		}
		if best == "" || distance < bestDistance || (distance == bestDistance && fnKey < best) {
			best, bestDistance = fnKey, distance
		}
	}
	return best
}

// editDistance is the plain Levenshtein distance over two short ASCII tokens.
func editDistance(a, b string) int {
	previous := make([]int, len(b)+1)
	current := make([]int, len(b)+1)
	for j := range previous {
		previous[j] = j
	}
	for i := 1; i <= len(a); i++ {
		current[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			current[j] = min(min(current[j-1]+1, previous[j]+1), previous[j-1]+cost)
		}
		previous, current = current, previous
	}
	return previous[len(b)]
}
