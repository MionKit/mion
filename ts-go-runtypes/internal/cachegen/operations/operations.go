// Package operations is the single source of truth for every RT operation the transformer can emit a cache entry for, and the one
// place the opaque function hash (fnHash) is computed. An operation is a named unit of work the backend renders for a given type,
// with a canonical Name, the emitted-entry FamilyTag and the compile-time option Axis refining it. The scanner injects
// fnHash(operation, args) for a call site and the emitter names entries and cross-family references with the SAME fnHash; routing
// both halves through this package is what guarantees they agree (fnhash.go). The registry also enumerates the value-level
// primitives reached only as JSON-composite dependencies or cross-family edges, because the emitter must hash THOSE too.
package operations

import "strings"

// Axis classifies the compile-time option axis that refines an operation's fnHash beyond its bare name.
type Axis int

const (
	// AxisNone takes no compile-time option; the canonical key is exactly the Name.
	AxisNone Axis = iota
	// AxisValidateOptions is refined by the ValidateOptions bag (validate / validationErrors).
	AxisValidateOptions
	// AxisJsonStrategy is refined by the JSON strategy token; the operation is composite, one emitted entry per strategy.
	AxisJsonStrategy
	// AxisHasUnknownKeysOptions is refined by the HasUnknownKeysOptions bag (hasUnknownKeys's `runsAfterValidation`).
	AxisHasUnknownKeysOptions
)

// Operation describes one renderable RT operation.
type Operation struct {
	// Name is the canonical operation name and the stable hash input; changing one changes every fnHash, and so invalidates caches.
	Name string
	// FamilyTag is the emitted-entry family tag, the disk-cache basename and the inner-fn family.
	// Empty for composite operations (AxisJsonStrategy), whose per-strategy tags live in constants.CacheModules.
	FamilyTag string
	// Axis is the compile-time option axis refining this operation.
	Axis Axis
	// Public reports whether the operation is user-recoverable through the InjectTypeFnArgs<T, Fn> marker, by a createX factory or the
	// generic getRTFunction resolver; only genuinely private plumbing stays false. It gates the overrideX path.
	Public bool
	// FnKey is the Fn token the InjectTypeFnArgs marker carries, empty only for an operation no marker names.
	FnKey string
	// DefaultStrategy applies when an AxisJsonStrategy call omits the options literal; empty for non-JSON operations.
	DefaultStrategy string
	// Strategies is every valid strategy token of an AxisJsonStrategy operation; it drives the collision-guard enumeration.
	Strategies []string
	// Doc is the user-facing one-liner the docs catalog page renders, kept here so no operation ships without one
	// (TestEveryOperationIsDocumented).
	Doc string
	// Factory is the public `createX` export that compiles this operation; only non-Public plumbing may leave it empty.
	Factory string
	// CircularGuarded marks an operation whose runtime factory can inline the circular-reference guard; arming
	// `{rejectCircularRefs: true}` folds circularCanonicalSuffix into the fnHash, so an armed and a plain factory for the same T
	// compile to distinct entries. The suffix applies across every Axis uniformly, which is why this is a bool, not a fourth Axis.
	CircularGuarded bool
	// CallOptions is the compile-time options literal that selects this operation at its Factory, as the docs catalog shows the
	// call; empty when the bare `createX<T>()` call does. AxisJsonStrategy rows leave it empty: the catalog spells their Strategies.
	CallOptions string
}

// registry is the complete operation set: the createX-backed operations plus the JSON value-level primitives the composites and
// cross-family edges reference. Order is not load-bearing.
var registry = []Operation{
	// Validators (ValidateOptions axis). Both guard circular refs.
	{Name: "validate", Doc: "Answers whether a value matches the type. The cheapest check, and the one every other validator builds on.", Factory: "createValidateFn", FamilyTag: "val", Axis: AxisValidateOptions, Public: true, FnKey: "validate", CircularGuarded: true},
	{Name: "validationErrors", Doc: "Returns the list of reasons a value does not match the type, with the path to each one.", Factory: "createGetValidationErrorsFn", FamilyTag: "verr", Axis: AxisValidateOptions, Public: true, FnKey: "validationErrors", CircularGuarded: true},

	// The FUSED validators (`{checkUnknowns: true}`): the plain body plus the unknown-key check spliced into every object-ish node,
	// so one walk answers "valid AND free of undeclared keys". Deliberately separate OPERATIONS, not a ValidateOptions variant:
	// a variant is root-scoped (children dispatch to plain entries), is never disk-cached and skips overrides, while a family renders
	// its own transitive subtree, caches under its own tag and honours overrides. The call site's marker still says 'val' / 'verr';
	// the scanner swaps the operation when it reads `checkUnknowns` (resolver/scan.go computeSiteFn), so no marker type changes.
	{Name: "validateStrict", Doc: "Answers whether a value matches the type AND carries no undeclared properties, in a single walk.", Factory: "createValidateFn", FamilyTag: "vst", Axis: AxisValidateOptions, Public: true, FnKey: "validateStrict", CircularGuarded: true, CallOptions: "{checkUnknowns: true}"},
	{Name: "validationErrorsStrict", Doc: "Returns the reasons a value does not match, including undeclared properties, in a single walk.", Factory: "createGetValidationErrorsFn", FamilyTag: "vest", Axis: AxisValidateOptions, Public: true, FnKey: "validationErrorsStrict", CircularGuarded: true, CallOptions: "{checkUnknowns: true}"},

	// The UNION-SCOPED validators (`{checkUnionUnknowns: true}`): narrower than the fused pair above on purpose, since a
	// stripping decoder already removes a plain object's undeclared keys but cannot remove one a sibling union member
	// declares, and removes nothing at all once a member carries an index signature. Families rather than variants for the
	// same reason as the fused pair.
	{Name: "validateUnionKeys", Doc: "Answers whether a value matches the type AND carries no property the matched union member leaves undeclared.", Factory: "createValidateFn", FamilyTag: "vuk", Axis: AxisValidateOptions, Public: true, FnKey: "validateUnionKeys", CircularGuarded: true, CallOptions: "{checkUnionUnknowns: true}"},
	{Name: "validationErrorsUnionKeys", Doc: "Returns the reasons a value does not match, counting a property the matched union member leaves undeclared.", Factory: "createGetValidationErrorsFn", FamilyTag: "veuk", Axis: AxisValidateOptions, Public: true, FnKey: "validationErrorsUnionKeys", CircularGuarded: true, CallOptions: "{checkUnionUnknowns: true}"},

	// createParseFn: restore a JSON.parse output into the typed shape AND check it in ONE walk, throwing an RTParseError with the
	// full report. One operation PER STRATEGY rather than a strategy axis: DemandFor's AxisJsonStrategy arm assumes a COMPOSITE and
	// variantKey keys entries off option NAMES with no strategy slot, so a type-walking family with a strategy axis would need new
	// plumbing in both; the scanner instead reads `strategy` and picks an operation, the route checkUnknowns already uses.
	// The three differ ONLY in what their body composes, and so in how undeclared keys are treated:
	//   - parse (the DEFAULT): rj + val. Nothing rebuilt, extras kept, the cheapest shape.
	//   - parseStrip: ukuw + rj + val. The ukuw pre-pass blanks undeclared keys before restore walks the declared shape.
	//   - parseFail: rj + vst. The fused validate{checkUnknowns} rejects extras in ONE pass, so strict costs a single call too.
	{Name: "parse", Doc: "Restores a JSON.parse output into the typed shape and checks it in one walk, throwing on a mismatch. Undeclared properties are kept.", Factory: "createParseFn", FamilyTag: "prs", Axis: AxisNone, Public: true, FnKey: "parse"},
	{Name: "parseStrip", Doc: "Parse, with undeclared properties removed before the value is restored.", Factory: "createParseFn", FamilyTag: "prss", Axis: AxisNone, Public: true, FnKey: "parseStrip", CallOptions: "{strategy: 'strip'}"},
	{Name: "parseFail", Doc: "Parse, rejecting any value that carries an undeclared property.", Factory: "createParseFn", FamilyTag: "prsf", Axis: AxisNone, Public: true, FnKey: "parseFail", CallOptions: "{strategy: 'fail'}"},

	// hasUnknownKeys: the standalone predicate, the right tool when the caller already holds a validated value.
	{Name: "hasUnknownKeys", Doc: "Answers whether a value carries any property the type does not declare.", Factory: "createHasUnknownKeysFn", FamilyTag: "huk", Axis: AxisHasUnknownKeysOptions, Public: true, FnKey: "hasUnknownKeys"},

	// Option-less leaf families.
	{Name: "unknownKeyErrors", Doc: "Returns one error per undeclared property, with the path to each one.", Factory: "createUnknownKeyErrorsFn", FamilyTag: "uke", Axis: AxisNone, Public: true, FnKey: "unknownKeyErrors"},
	{Name: "cloneExactShape", Doc: "Copies a value keeping only the properties the type declares.", Factory: "createCloneExactShapeFn", FamilyTag: "ces", Axis: AxisNone, Public: true, FnKey: "cloneExactShape"},
	{Name: "formatTransform", Doc: "Applies the type's format rules to a value, for example trimming a string or clamping a number.", Factory: "createFormatTransformFn", FamilyTag: "fmt", Axis: AxisNone, Public: true, FnKey: "formatTransform"},
	{Name: "toBinary", Doc: "Writes a value to the compact binary wire format.", Factory: "createBinaryEncoderFn", FamilyTag: "tb", Axis: AxisNone, Public: true, FnKey: "toBinary", CircularGuarded: true},
	{Name: "fromBinary", Doc: "Reads a value back from the binary wire format.", Factory: "createBinaryDecoderFn", FamilyTag: "fb", Axis: AxisNone, Public: true, FnKey: "fromBinary"},
	// jsonSchema renders the document at build time (schemadoc.RenderDocument); the entry's fn just returns it.
	{Name: "jsonSchema", Doc: "Returns the JSON Schema document describing the type.", Factory: "createJsonSchemaFn", FamilyTag: "jsc", Axis: AxisNone, Public: true, FnKey: "jsonSchema"},
	// classSerializerReg backs registerClassSerializer's trailing marker: the entry is a name card carrying the source class name,
	// so registration reads the build-time name WITHOUT demanding the type's reflection graph. Nothing to override or recover.
	{Name: "classSerializerReg", Doc: "Carries a class's build-time name so it can be registered without pulling in the whole type graph. Internal to registerClassSerializer.", Factory: "registerClassSerializer", FamilyTag: "csr", Axis: AxisNone, Public: false, FnKey: "classSerializerReg"},

	// The composite JSON encoder / decoder (JsonStrategy axis): FamilyTag is empty, each strategy renders its own entry under a
	// per-strategy tag in constants.CacheModules.
	{
		Name: "jsonEncoder", Doc: "Turns a value into a JSON string. The strategy picks how: build a new value, transform in place, write the string in one pass, or use the compact positional wire.", Factory: "createJsonEncoderFn", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonEncoder", CircularGuarded: true,
		// `clone` is shape-derived: it builds a NEW value from the declared shape (never `{...v}`), so it is stripped by construction
		// and a separate strip variant would be redundant. `mutate` transforms in place, keeping undeclared keys and allocating nothing.
		// `direct` is the single-pass stringifyJson and always strips. `compact` writes declared props as a positional array, no key
		// names on the wire, strips extras like `clone`, and pairs with the `compact` decoder.
		DefaultStrategy: "clone",
		Strategies:      []string{"clone", "mutate", "direct", "compact"},
	},
	{
		Name: "jsonDecoder", Doc: "Turns a JSON string back into a typed value. The strategy decides whether undeclared properties survive.", Factory: "createJsonDecoderFn", Axis: AxisJsonStrategy, Public: true, FnKey: "jsonDecoder",
		// `compact` rebuilds the declared object from the positional-array wire, which the key-based strip / preserve decoders cannot read.
		DefaultStrategy: "strip",
		Strategies:      []string{"strip", "preserve", "compact"},
	},

	// The JSON value-level primitives the composites wrap and createPrepareForJsonFn and its siblings compile. Three operations sit
	// behind each prepare / restore factory, one per `strategy`, swapped the way createParseFn's are (jsonValueStrategyOperation in
	// resolver/scan.go); a framework threading its own marker reaches any of them by FnKey through getRTFunction.
	// Each FnKey equals its family tag, and there is no runtime hashing, so the resolver reads the plugin-injected plain fnHash.
	//   - rjs (clone restore): mion's `clone` strategy decodes with it, no createJsonDecoderFn strategy composes it.
	//   - sj: the `direct` encoder body. ukuw: the strip decoder's wire pre-pass.
	{Name: "prepareForJsonMutate", Doc: "Turns a value into a JSON-safe value in place. Nothing is allocated and undeclared properties are kept.", Factory: "createPrepareForJsonFn", FamilyTag: "pj", Axis: AxisNone, Public: true, FnKey: "prepareForJsonMutate", CallOptions: "{strategy: 'mutate'}"},
	{Name: "prepareForJsonClone", Doc: "Builds a new JSON-safe value from the declared shape, so undeclared properties are dropped.", Factory: "createPrepareForJsonFn", FamilyTag: "pjs", Axis: AxisNone, Public: true, FnKey: "prepareForJsonClone"},
	{Name: "restoreFromJsonMutate", Doc: "Turns a JSON-safe value back into the typed shape in place, keeping undeclared properties.", Factory: "createRestoreFromJsonFn", FamilyTag: "rj", Axis: AxisNone, Public: true, FnKey: "restoreFromJsonMutate", CallOptions: "{strategy: 'mutate'}"},
	{Name: "restoreFromJsonClone", Doc: "Rebuilds the typed shape from a JSON-safe value, so undeclared properties are dropped.", Factory: "createRestoreFromJsonFn", FamilyTag: "rjs", Axis: AxisNone, Public: true, FnKey: "restoreFromJsonClone"},
	{Name: "stringifyJson", Doc: "Writes a value straight to a JSON string in one pass, with no intermediate value.", Factory: "createStringifyJsonFn", FamilyTag: "sj", Axis: AxisNone, Public: true, FnKey: "stringifyJson"},
	{Name: "stripUnknownKeysWire", Doc: "Blanks undeclared properties on incoming JSON before it is restored.", Factory: "createStripUnknownKeysFn", FamilyTag: "ukuw", Axis: AxisNone, Public: true, FnKey: "stripUnknownKeysWire"},
	// compactForJson / compactFromJson are the positional-tuple round-trip pair the `compact` strategy composes.
	{Name: "compactForJson", Doc: "Builds a value whose objects are positional arrays, so property names never reach the wire.", Factory: "createPrepareForJsonFn", FamilyTag: "cj", Axis: AxisNone, Public: true, FnKey: "compactForJson", CallOptions: "{strategy: 'compact'}"},
	{Name: "compactFromJson", Doc: "Rebuilds a keyed object from the positional array the compact encoder wrote.", Factory: "createRestoreFromJsonFn", FamilyTag: "cjr", Axis: AxisNone, Public: true, FnKey: "compactFromJson", CallOptions: "{strategy: 'compact'}"},
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
	mustBeCollisionFree()
}

// All returns a copy of the registry in declaration order, for cmd/gen-fn-hashes to emit the TS fnHash table,
// the version-independent `fnKey → variant → fnHash` mirror the runtime's getFnHash resolves against.
func All() []Operation {
	out := make([]Operation, len(registry))
	copy(out, registry)
	return out
}

func ByName(name string) (Operation, bool) {
	op, ok := byName[name]
	return op, ok
}

// ByFnKey returns the operation a call site's InjectTypeFnArgs Fn token names; the scanner's lookup.
func ByFnKey(fnKey string) (Operation, bool) {
	op, ok := byFnKey[fnKey]
	return op, ok
}

// ByFamilyTag returns the operation emitting entries under a family tag, for the emitter; composite operations are not indexed.
func ByFamilyTag(tag string) (Operation, bool) {
	op, ok := byFamilyT[tag]
	return op, ok
}

// SuggestFnKey returns the marker token a mistyped one most likely meant, or "" when nothing is close.
// The common case is a RETIRED short tag, which maps straight back to its operation; anything else falls back to edit distance.
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
		// Roughly a quarter of the token may be wrong, never more than 3 edits.
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
