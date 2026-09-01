package typefunctions

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// JSON composite codegen.
//
// `createJsonEncoderFn<T>()` / `createJsonDecoderFn<T>()` are the only RT families
// whose runtime work is COMPOSED from several primitives (prepareForJson +
// JSON.stringify, restoreFromJson + ukuWire + JSON.parse, …) selected by a
// compile-time `strategy`. Every other family is a single cache entry the
// runtime looks up by key. To make the JSON pair uniform with the rest, the
// composition lives here: one Go-emitted entry per (typeId, strategy) that wraps
// the underlying primitives with native JSON. The TS `createJsonEncoderFn` /
// `createJsonDecoderFn` then collapse to the same `resolveTupleEntry` lookup as
// binary.
//
// The composite entry is keyed by the strategy's composite fnHash
// (`operations.FnHashFor(jsonEncoder|jsonDecoder op, nil, strategy)`) and looks
// up its primitives by THEIR fnHash (`operations.PlainHash(primOp)+"_"+id`).
// Each composite's module Deps name exactly those primitive entries, so the
// per-entry import closure pulls the primitives (and their transitive child
// factories) whenever a composite is demanded — the scanner additionally
// records both in the site's demand (operations.DemandFor). Composites do NOT
// walk types and emit no `val_<member>` cross-family edges.
type jsonCompositeFamily struct {
	// opName is the composite operation ("jsonEncoder" / "jsonDecoder").
	opName string
	// tags is the set of per-strategy composite family tags to collect demand
	// for and render.
	tags []string
}

// jsonEncoderFamily / jsonDecoderFamily enumerate the per-strategy composite
// tags of each operation.
var (
	jsonEncoderFamily = jsonCompositeFamily{
		opName: "jsonEncoder",
		tags:   []string{"jeCL", "jeMU", "jeDI", "jeCO"},
	}
	jsonDecoderFamily = jsonCompositeFamily{
		opName: "jsonDecoder",
		tags:   []string{"jdST", "jdPR", "jdCO"},
	}
)

// CollectJsonCompositeEntries collects one entry per demanded (typeId,
// strategy) across both composite operations. Disk-cached per (id,
// compositeTag) so repeat builds skip re-rendering.
//
// `rendered` is the already-collected entry graph (runtype entries + every
// family graph — the resolver merges those BEFORE composites collect). Each
// composite consults its primitives' rendered IsNoop flags and ELIDES the
// binding for identity primitives: the prologue line, the import edge, and
// the call wrapper all drop (`return JSON.parse(s)` instead of
// `return rjFn(JSON.parse(s))`). When EVERY binding elides (and the root
// needs no JSON envelope) the entry itself collapses to the noop short-form
// tuple — no body at all; the runtime registers the composite's native-JSON
// noop (see collectJsonCompositeEntry). Keying elision on the RENDERED
// entries — not a re-derived predicate — keeps the composite exactly in
// lockstep with whatever each family's own render decided (walker Finalize,
// noop gate, or disk-cached verdict). A primitive missing from the graph is
// treated as live (conservative bind; AssertCompositeSoftDeps still surfaces
// the invariant breach). Nil graph = bind everything (unit-test shape).
func CollectJsonCompositeEntries(dump protocol.Dump, opts RenderOpts, rendered entrymodules.Graph) entrymodules.Graph {
	graph := entrymodules.Graph{}
	refTable := opts.RefTable
	if refTable == nil {
		refTable = make(map[string]*reflection.RunType, len(dump.RunTypes))
		for _, runType := range dump.RunTypes {
			if runType == nil || runType.ID == "" {
				continue
			}
			refTable[runType.ID] = runType
		}
	}
	for _, family := range []jsonCompositeFamily{jsonEncoderFamily, jsonDecoderFamily} {
		for _, tag := range family.tags {
			composite, ok := constants.JsonCompositeByTag(tag)
			if !ok {
				continue
			}
			// Demand for this composite tag: the scanner records one SiteDemand per
			// createJsonEncoderFn/Decoder site whose strategy maps to this tag. Dedup is
			// by id (the composite has no ValidateOptions-style sub-variant).
			demand := collectFamilyDemand(dump.Sites, tag)
			ids := make([]string, 0, len(demand))
			for id := range demand {
				ids = append(ids, id)
			}
			sort.Strings(ids)
			for _, id := range ids {
				runType := refTable[id]
				if runType == nil {
					continue
				}
				// A site can demand both the plain and the armed (rejectCircularRefs)
				// composite for the same id — render each (plain before armed).
				variants := demand[id]
				sort.Slice(variants, func(i, j int) bool {
					return !variants[i].RejectCircular && variants[j].RejectCircular
				})
				for _, demanded := range variants {
					if entry := collectJsonCompositeEntry(runType, tag, composite, opts, rendered, refTable, demanded.RejectCircular); entry != nil {
						graph.Add(entry)
					}
				}
			}
		}
	}
	return graph
}

// primitiveIsLive reports whether the composite must bind the primitive
// operation's entry for id — false exactly when the rendered graph holds a
// noop (family-identity) entry for it, in which case calling it is dead
// weight and the binding elides. Missing entries stay live (conservative).
func primitiveIsLive(rendered entrymodules.Graph, primOp string, id string) bool {
	if rendered == nil {
		return true
	}
	entry, ok := rendered[operations.PlainHash(primOp)+"_"+id]
	if !ok || entry == nil {
		return true
	}
	return !entry.IsNoop
}

// collectJsonCompositeEntry renders (and disk-caches) one composite entry for
// a given runtype + strategy. The body is FIXED per strategy — it wraps the
// LIVE primitives addressed by their fnHash with native JSON (identity
// primitives elide, see CollectJsonCompositeEntries) — so there is no walker
// and no cross-family edges; the module Deps are the strategy's live
// primitive entries for the same id.
//
// Cache note: a primitive's noop verdict is a pure function of its
// structural id (+ family), so the liveness set is identical on every build
// that hits the same structural header — recomputing deps from the current
// graph on a cache hit always agrees with the baked body.
func collectJsonCompositeEntry(runType *reflection.RunType, tag string, composite constants.JsonComposite, opts RenderOpts, rendered entrymodules.Graph, refTable map[string]*reflection.RunType, rejectCircular bool) *entrymodules.Entry {
	op, ok := operations.ByName(composite.OpName)
	if !ok {
		return nil
	}
	entryKey := operations.FnHashFor(op, nil, composite.Strategy, rejectCircular) + "_" + runType.ID
	// Armed encoder over a cycle-capable type: bake the circular skeleton so the
	// body prepends the inline guard (nil for an acyclic type → behaves like the
	// plain composite under a distinct key). Decoders never arm (jsonDecoder is
	// not CircularGuarded, so rejectCircular is normalised to false upstream).
	var circularSkeleton *CircularSkeleton
	if rejectCircular {
		circularSkeleton = BuildCircularSkeleton(runType, refTable)
	}
	// Override: a custom JSON encoder/decoder registered for this type replaces
	// the whole composite (every strategy of the op) with a cfn redirect. The
	// node id already folded the override hash, so this key is unique to the
	// overridden type. Only the PLAIN variant is overridden — the armed variant
	// falls through to structural emit so its guard still runs.
	if cfnHash := runType.Overrides[op.FnKey]; cfnHash != "" && !rejectCircular {
		return buildRedirectEntry(entryKey, tag, runType, cfnHash, opts)
	}
	isLive := func(primOp string) bool { return primitiveIsLive(rendered, primOp, runType.ID) }

	// LIVE primitive references are SOFT: the composite body binds each via
	// `utl.getRT(key).fn` — always resolvable, because a composite site's
	// demand renders every primitive (real, noop short-form, or
	// alwaysThrow), noop entries register with the family noop fn pre-set,
	// and getRT materializes before returning. The resolver asserts the
	// presence invariant at collect time (AssertCompositeSoftDeps).
	deps := jsonCompositeDeps(composite, runType.ID, isLive)
	wrapRoot := rootNeedsDataOnlyWrap(runType)
	// An armed encoder over a cyclable type must ALWAYS ship its full body so the
	// guard prologue runs — never the noop short-form. (Acyclic armed types have a
	// nil skeleton and behave like the plain composite.)
	guarded := circularSkeleton != nil

	// Noop short-form: with every primitive binding elided (deps empty) and no
	// root envelope, the full body would be nothing but native JSON —
	// `return JSON.stringify(v)` / `return JSON.parse(s)` — which IS the
	// composite family noop (entryTuple.ts registers noopStringify for je*
	// tags, noopParse for jd* tags). Emit the same short-form tuple the family
	// renderer uses (key, typeName, code hole, isNoop=true): no factory ships
	// and the runtime substitutes the native-JSON fn. wrapRoot (undefined/void)
	// encoders keep their full body — the `[v]` envelope is real work — a guarded
	// entry keeps its full body too, and overridden types never reach here
	// (redirect returned above). Not disk-cached: trivial to re-derive.
	if len(deps) == 0 && !wrapRoot && !guarded {
		args := holeifyArgs([]string{
			quoteJS(entryKey),
			quoteJS(rtTypeName(runType)),
			"undefined", // code — holed (runtime uses the composite's native-JSON noop)
			"true",      // isNoop — kept: the signal that selects the noop fn
		})
		return &entrymodules.Entry{Key: entryKey, Kind: entrymodules.KindTypeFn, FamilyTag: tag, ArgsText: joinArgs(args), IsNoop: true}
	}

	// The armed variant shares the plain entry's (id, tag) disk-cache path, so it
	// is session-rendered — never read from or written to that cache.
	if !guarded {
		if cachedArgs, ok := tryReadCachedCompositeEntry(runType, tag, opts); ok {
			return &entrymodules.Entry{Key: entryKey, Kind: entrymodules.KindTypeFn, FamilyTag: tag, ArgsText: cachedArgs, SoftDeps: deps}
		}
	}

	skeletonJS := ""
	pureFnDepsArg := "[]"
	softDeps := deps
	if guarded {
		skeletonJS = circularSkeleton.JSLiteral()
		pureFnDepsArg = "[" + quoteJS(circularGuardPureFnKey) + "]"
		softDeps = append(append([]string(nil), deps...), circularGuardPureFnKey)
	}

	contextLines, innerFn := jsonCompositeBody(composite, runType.ID, entryKey, isLive, wrapRoot, skeletonJS)
	_, factoryBody := WrapClosure("g_"+entryKey, entryKey, innerFn, contextLines)
	codeArg := "undefined"
	if opts.EmitMode.EmitsCode() {
		codeArg = quoteJS(factoryBody)
	}
	createRTFnArg := "u"
	if opts.EmitMode.EmitsFactory() {
		createRTFnArg = "function g_" + entryKey + "(utl){" + factoryBody + "}"
	}
	args := holeifyArgs([]string{
		quoteJS(entryKey),
		quoteJS(rtTypeName(runType)),
		codeArg,
		"false",       // isNoop — this path always has a real body (a live primitive, the wrapRoot envelope, or the guard)
		"[]",          // rtDependencies — primitive refs are resolved by fnHash, not same-family deps
		pureFnDepsArg, // pureFnDependencies — rt::findCycle for the armed guard, else empty
		createRTFnArg,
	})
	argsText := joinArgs(args)
	if !guarded {
		writeCachedCompositeEntry(runType, tag, argsText, opts)
	}
	return &entrymodules.Entry{Key: entryKey, Kind: entrymodules.KindTypeFn, FamilyTag: tag, ArgsText: argsText, SoftDeps: softDeps}
}

// circularGuardPureFnKey is the built-in pure-fn key the armed circular guard
// references (delivered on demand via the entry's SoftDeps). circularGuardFnAlias
// is the local binding name (mirrors pureFnAliases["findCycle"], so the
// composite's guard bytes match the walker-path guard's).
const (
	circularGuardPureFnKey = corePureFnNamespace + "::findCycle"
	circularGuardFnAlias   = "fc"
)

// jsonCompositeDeps names the primitive entries a composite body resolves at
// materialise time — one `<plainFhash>_<id>` per LIVE family in the
// strategy's JsonStrategyFamilies row (elided identity primitives leave no
// import edge). These become the composite module's imports so the live
// primitives (and their transitive child factories) always load with it.
func jsonCompositeDeps(composite constants.JsonComposite, id string, isLive func(primOp string) bool) []string {
	tags := constants.JsonStrategyFamilies[composite.OpName+"|"+composite.Strategy]
	deps := make([]string, 0, len(tags))
	for _, tag := range tags {
		primitive, ok := operations.ByFamilyTag(tag)
		if !ok {
			continue
		}
		if !isLive(primitive.Name) {
			continue
		}
		deps = append(deps, operations.PlainHash(primitive.Name)+"_"+id)
	}
	return deps
}

// rootNeedsDataOnlyWrap reports whether a root type is DataOnly-valid but has no
// top-level JSON representation, so the encoder must wrap its value in a JSON
// envelope (see jsonCompositeBody's arrayWrap). That is exactly `undefined` and
// `void`: both are kept by DataOnly (DataOnly<undefined> = undefined) yet
// `JSON.stringify(undefined)` returns the JS value `undefined`, not a document,
// so a naive decode(encode(v)) throws on JSON.parse(undefined). Every other
// DataOnly-valid root either serializes natively (null/number/string/bigint/
// Date/Map/Set/…) or is uninhabitable and already alwaysThrows.
func rootNeedsDataOnlyWrap(runType *reflection.RunType) bool {
	if runType == nil {
		return false
	}
	switch runType.Kind {
	case reflection.KindUndefined, reflection.KindVoid:
		return true
	}
	return false
}

// jsonCompositeBody returns (contextLines, innerFnDeclaration) for a composite
// strategy. The inner function name is the composite entry key so stack traces
// identify it; the body is a faithful Go-side copy of createRTFunctions.ts's
// pre-migration per-strategy composition, binding each LIVE primitive's fn
// directly. Identity primitives elide: the wrapped expression passes through
// unwrapped — byte-for-byte what calling the family noop fn would compute
// (identity for pj/pjs/rj/ukuw; for sj the elided form is the family noop
// itself, native JSON.stringify).
func jsonCompositeBody(composite constants.JsonComposite, id string, entryKey string, isLive func(primOp string) bool, wrapRoot bool, circularSkeletonJS string) (contextLines string, innerFn string) {
	// resolve emits a context-item const binding `name` to the primitive's fn.
	// The direct `.fn` read is always resolvable: noop primitives register
	// with the family noop fn pre-set (entryTuple.ts familyMeta — identity
	// for pj/pjs/rj/ukuw, JSON.stringify for sj), getRT materializes before
	// returning, and the demand machinery renders an entry for every
	// primitive a composite wraps (asserted at collect time). Noop/missing
	// resolution is rtUtils' job — emitted code never carries fallbacks.
	var ctx []string
	resolve := func(name, primOp string) {
		key := operations.PlainHash(primOp) + "_" + id
		ctx = append(ctx, "const "+name+" = utl.getRT("+quoteJS(key)+").fn")
	}
	// wrap binds the primitive and wraps expr in its call — or, when the
	// primitive's rendered entry is the family identity, passes expr through
	// untouched (no binding, no import, no call).
	wrap := func(name, primOp, expr string) string {
		if !isLive(primOp) {
			return expr
		}
		resolve(name, primOp)
		return name + "(" + expr + ")"
	}
	// arrayWrap wraps a JSON-value expression in a one-element array when the
	// root type (undefined / void) has no top-level JSON form. Encode then emits
	// the valid document "[null]" instead of the bare JS value `undefined`; the
	// decoder's restoreFromJson returns undefined for any input, so the
	// round-trip holds with NO decode-side change. See rootNeedsDataOnlyWrap.
	arrayWrap := func(expr string) string {
		if wrapRoot {
			return "[" + expr + "]"
		}
		return expr
	}

	var body string
	switch composite.OpName {
	case "jsonEncoder":
		switch composite.Strategy {
		case "direct":
			if isLive("stringifyJson") {
				resolve("sjFn", "stringifyJson")
				if wrapRoot {
					// sjFn(v) is the JS value `undefined` for undefined/void;
					// re-stringify it inside the array so encode yields "[null]".
					body = "return JSON.stringify([sjFn(v)]);"
				} else {
					body = "return sjFn(v);"
				}
			} else {
				// sj's family noop IS native JSON.stringify — the elided
				// form inlines it instead of unwrapping to bare `v`.
				body = "return JSON.stringify(" + arrayWrap("v") + ");"
			}
		case "clone":
			// Shape-derived clone (prepareForJsonSafe builds a NEW value from the
			// declared shape) — undeclared keys are dropped by construction, so the
			// clone is stripped without a separate strip pass.
			body = "return JSON.stringify(" + arrayWrap(wrap("pjsFn", "prepareForJsonSafe", "v")) + ");"
		case "mutate":
			body = "return JSON.stringify(" + arrayWrap(wrap("pjFn", "prepareForJson", "v")) + ");"
		case "compact":
			// Positional-array clone (compactForJson builds a NEW value emitting
			// declared object props by position, no key names) — strips undeclared
			// keys by construction like `clone`. Pairs with the `compact` decoder.
			body = "return JSON.stringify(" + arrayWrap(wrap("cjFn", "compactForJson", "v")) + ");"
		}
		// Armed circular guard (encoders only): a detected cycle throws a
		// CircularReferenceError before any JSON is produced. The pure fn + baked
		// skeleton are hoisted once into the factory closure.
		if circularSkeletonJS != "" {
			ctx = append(ctx,
				"const "+circularGuardFnAlias+" = utl.getPureFn('"+circularGuardPureFnKey+"')",
				"const "+circularGuardContextKey+" = "+circularSkeletonJS)
			body = "const cyR=" + circularGuardFnAlias + "(v," + circularGuardContextKey + ");if(cyR)throw utl.circularError(cyR);" + body
		}
		innerFn = "function " + entryKey + "(v){" + body + "}"
	case "jsonDecoder":
		switch composite.Strategy {
		case "preserve":
			body = "return " + wrap("rjFn", "restoreFromJson", "JSON.parse(s)") + ";"
		case "strip":
			body = "return " + wrap("rjFn", "restoreFromJson", wrap("ukuwFn", "unknownKeysToUndefinedWire", "JSON.parse(s)")) + ";"
		case "compact":
			// Inverse of compactForJson: rebuild the keyed object from the
			// positional array JSON.parse produced.
			body = "return " + wrap("cjrFn", "compactFromJson", "JSON.parse(s)") + ";"
		}
		innerFn = "function " + entryKey + "(s){" + body + "}"
	}
	return strings.Join(ctx, ";\n"), innerFn
}

// tryReadCachedCompositeEntry loads a previously written composite arg text
// from the disk store. The composite references only entries sharing
// runType.ID, so the header structural-id check alone proves the baked
// fnHashes are still valid — no child/cross-family ref bookkeeping is needed.
func tryReadCachedCompositeEntry(runType *reflection.RunType, tag string, opts RenderOpts) (string, bool) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return "", false
	}
	expectedStructural := opts.Lookup.StructuralForHash(runType.ID)
	if expectedStructural == "" {
		return "", false
	}
	entry, ok, err := opts.Store.ReadRT(runType.ID, tag)
	if err != nil || !ok || entry == nil {
		return "", false
	}
	if entry.StructuralID != expectedStructural {
		return "", false
	}
	return entry.ArgsText, true
}

// writeCachedCompositeEntry persists a composite arg text under its
// per-strategy tag so repeat builds skip re-rendering. Best-effort — failures
// are swallowed (the shared writeCachedEntry already logs FS
// misconfigurations on the primitive path).
func writeCachedCompositeEntry(runType *reflection.RunType, tag string, argsText string, opts RenderOpts) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return
	}
	structural := opts.Lookup.StructuralForHash(runType.ID)
	if structural == "" {
		return
	}
	entry := diskcache.RTEntry{
		Format:       diskcache.FormatVersion,
		StructuralID: structural,
		ArgsText:     argsText,
	}
	_ = opts.Store.WriteRT(runType.ID, tag, entry)
}

// AssertCompositeSoftDeps verifies the demand invariant the composite
// prologues rely on: every primitive a composite binds via
// `utl.getRT(key).fn` must have a rendered (non-stub) entry in the graph.
// A miss is an internal bug — the composite site's demand renders each
// primitive as real, noop short-form, or alwaysThrow — and the unguarded
// `.fn` read would crash at runtime, so it surfaces as an Error diagnostic
// at collect time instead. Deterministic order via sorted keys.
//
// provenance maps a type id to the createJsonEncoderFn/Decoder call sites that
// demanded it (RenderOpts.ProvenanceSites). A breach fans out one diagnostic
// per demanding site — anchored at the user's call so a future invariant
// breach is reproducible from their source instead of a file-less internal
// error carrying only opaque cache keys. The offending type id rides as a
// third message arg regardless; when no site is known (unit-test shape, or a
// composite with no recorded provenance) a single file-less diagnostic is
// still emitted so the tripwire never goes silent.
func AssertCompositeSoftDeps(graph entrymodules.Graph, provenance map[string][]diagnostics.Site, diagSink *[]diagnostics.Diagnostic) {
	if diagSink == nil {
		return
	}
	keys := make([]string, 0, len(graph))
	for key := range graph {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		entry := graph[key]
		if entry == nil || entry.Kind != entrymodules.KindTypeFn {
			continue
		}
		if _, ok := constants.JsonCompositeByTag(entry.FamilyTag); !ok {
			continue
		}
		for _, dep := range entry.SoftDeps {
			// Built-in pure-fn edges (the armed guard's `rt::findCycle`) are NOT
			// composite-bound primitives: they bind via `utl.getPureFn`, and
			// serveBuiltinPureFns delivers them AFTER this assertion runs (with its
			// own PFE9012 tripwire for a genuinely missing body). Skip them here.
			if isBuiltinPureFnDep(dep) {
				continue
			}
			if target, ok := graph[dep]; ok && target != nil && target.Kind != entrymodules.KindMissing {
				continue
			}
			_, typeID, ok := splitNamespacedHash(entry.Key)
			if !ok {
				typeID = entry.Key
			}
			sites := provenance[typeID]
			if len(sites) == 0 {
				*diagSink = append(*diagSink, diagnostics.New(diagnostics.CodeCompositeMissingPrimitive, diagnostics.Site{}, entry.Key, dep, typeID))
				continue
			}
			for _, site := range sites {
				*diagSink = append(*diagSink, diagnostics.New(diagnostics.CodeCompositeMissingPrimitive, site, entry.Key, dep, typeID))
			}
		}
	}
}
