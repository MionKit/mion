package typefunctions

import (
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/purefnids"
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

// JSON composite codegen: `createJsonEncoderFn<T>()` / `createJsonDecoderFn<T>()` are the only RT families whose runtime
// work is COMPOSED from several primitives selected by a compile-time `strategy`. Composing here, one Go-emitted entry
// per (typeId, strategy) wrapping the primitives with native JSON, lets the TS side collapse to the same
// `resolveTupleEntry` lookup as binary.
// A composite is keyed by the strategy's composite fnHash and looks its primitives up by THEIR fnHash
// (`operations.PlainHash(primOp)+"_"+id`); its module Deps name exactly those entries, so the import closure pulls the
// primitives and their transitive child factories. Composites do NOT walk types and emit no cross-family edges.
type jsonCompositeFamily struct {
	// opName is the composite operation ("jsonEncoder" / "jsonDecoder").
	opName string
	// tags is the set of per-strategy composite family tags to collect demand for and render.
	tags []string
}

var (
	jsonEncoderFamily = jsonCompositeFamily{
		opName: "jsonEncoder",
		tags:   []string{"jeCL", "jeMU", "jeCO"},
	}
	jsonDecoderFamily = jsonCompositeFamily{
		opName: "jsonDecoder",
		tags:   []string{"jdCL", "jdMU", "jdCO"},
	}
)

// CollectJsonCompositeEntries collects one entry per demanded (typeId, strategy) across both composite operations,
// disk-cached per (id, compositeTag).
// `rendered` is the entry graph the resolver merges BEFORE composites collect. A composite reads its primitives'
// rendered IsNoop flags and ELIDES an identity primitive's binding, import edge and call wrapper; with every binding
// elided and no root envelope the entry collapses to the noop short-form tuple (see collectJsonCompositeEntry).
// Keying elision on the RENDERED entries, not a re-derived predicate, keeps the composite in lockstep with what each
// family's own render decided. A primitive missing from the graph is bound anyway (AssertCompositeSoftDeps still
// reports the breach); a nil graph binds everything, the unit-test shape.
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
			// The scanner records one SiteDemand per createJsonEncoderFn/Decoder site whose strategy maps to this tag;
			// dedup is by id, the composite has no ValidateOptions-style sub-variant.
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
				// A site can demand both the plain and the armed (rejectCircularRefs) composite for one id; plain renders first.
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

// primitiveIsLive reports whether the composite must bind the primitive's entry for id: false exactly when the rendered
// graph holds a noop (family-identity) entry, whose call would be dead weight. A missing entry stays live.
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

// collectJsonCompositeEntry renders (and disk-caches) one composite entry for a runtype + strategy. The body is FIXED
// per strategy, wrapping the LIVE primitives addressed by their fnHash with native JSON, so there is no walker and no
// cross-family edges; the module Deps are the strategy's live primitive entries for the same id.
// A primitive's noop verdict is a pure function of its structural id and family, so deps recomputed from the current
// graph on a cache hit always agree with the baked body.
func collectJsonCompositeEntry(runType *reflection.RunType, tag string, composite constants.JsonComposite, opts RenderOpts, rendered entrymodules.Graph, refTable map[string]*reflection.RunType, rejectCircular bool) *entrymodules.Entry {
	op, ok := operations.ByName(composite.OpName)
	if !ok {
		return nil
	}
	entryKey := operations.FnHashFor(op, nil, composite.Strategy, rejectCircular) + "_" + runType.ID
	// Armed encoder over a cycle-capable type: the baked skeleton makes the body prepend the inline guard (nil for an
	// acyclic type, which then behaves like the plain composite under a distinct key).
	// Decoders never arm: jsonDecoder is not CircularGuarded, so rejectCircular is normalised to false upstream.
	var circularSkeleton *CircularSkeleton
	if rejectCircular {
		circularSkeleton = BuildCircularSkeleton(runType, refTable)
	}
	// A registered custom encoder/decoder replaces every strategy of the op with a cfn redirect; the node id already folded
	// the override hash, so this key is unique to the overridden type.
	// Only the PLAIN variant is overridden: the armed one falls through to structural emit so its guard still runs.
	if cfnID := runType.Overrides[op.Name]; cfnID != "" && !rejectCircular {
		return buildRedirectEntry(entryKey, tag, runType, cfnID, opts)
	}
	isLive := func(primOp string) bool { return primitiveIsLive(rendered, primOp, runType.ID) }

	// LIVE primitive references are SOFT: `utl.getRT(key).fn` always resolves because a composite site's demand renders
	// every primitive (real, noop short-form or alwaysThrow), a noop registers with the family noop fn pre-set, and getRT
	// materializes before returning. AssertCompositeSoftDeps checks that presence invariant at collect time.
	deps := jsonCompositeDeps(composite, runType.ID, isLive)
	wrapRoot := rootNeedsDataOnlyWrap(runType)
	// An armed encoder over a cyclable type must ALWAYS ship its full body so the guard prologue runs, never the short-form.
	guarded := circularSkeleton != nil

	// Noop short-form: with every binding elided and no root envelope the body would be nothing but native JSON, which IS
	// the composite family noop (entryTuple.ts registers noopStringify for je* tags, noopParse for jd*). The short-form
	// tuple (key, typeName, code hole, isNoop=true) ships no factory and the runtime substitutes the native-JSON fn.
	// A wrapRoot encoder keeps its full body (the `[v]` envelope is real work), so does a guarded one, and an overridden
	// type returned its redirect above. Not disk-cached: trivial to re-derive.
	if len(deps) == 0 && !wrapRoot && !guarded {
		args := holeifyArgs([]string{
			quoteJS(entryKey),
			quoteJS(rtTypeName(runType)),
			"undefined", // code — holed (runtime uses the composite's native-JSON noop)
			"true",      // isNoop — kept: the signal that selects the noop fn
		})
		return &entrymodules.Entry{Key: entryKey, Kind: entrymodules.KindTypeFn, FamilyTag: tag, ArgsText: joinArgs(args), IsNoop: true}
	}

	// The armed variant shares the plain entry's (id, tag) cache path, so it is session-rendered, never read or written.
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
		pureFnDepsArg = "[" + quoteJS(purefnids.FindCycle) + "]"
		softDeps = append(append([]string(nil), deps...), purefnids.FindCycle)
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
		pureFnDepsArg, // pureFnDependencies — findCycle for the armed guard, else empty
		createRTFnArg,
	})
	argsText := joinArgs(args)
	if !guarded {
		writeCachedCompositeEntry(runType, tag, argsText, opts)
	}
	return &entrymodules.Entry{Key: entryKey, Kind: entrymodules.KindTypeFn, FamilyTag: tag, ArgsText: argsText, SoftDeps: softDeps}
}

// circularGuardFnAlias is the local the armed guard binds findCycle to inside an emitted body.
const circularGuardFnAlias = "fc"

// jsonCompositeDeps names the primitive entries a composite body resolves at materialise time, one `<plainFhash>_<id>`
// per LIVE family in the strategy's JsonStrategyFamilies row; an elided identity primitive leaves no import edge.
// These become the composite module's imports, so the live primitives and their child factories load with it.
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

// rootNeedsDataOnlyWrap reports whether a root is DataOnly-valid with no top-level JSON form, so the encoder must wrap
// it in an envelope (jsonCompositeBody's arrayWrap). That is exactly `undefined` and `void`: DataOnly keeps both, yet
// `JSON.stringify(undefined)` returns the JS value `undefined`, not a document, so decode(encode(v)) throws on parse.
// Every other DataOnly-valid root either serializes natively or is uninhabitable and already alwaysThrows.
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

// jsonCompositeBody returns (contextLines, innerFnDeclaration) for a composite strategy; the inner function is named
// after the entry key so stack traces identify it, and the body binds each LIVE primitive's fn directly.
// An identity primitive elides, passing its expression through unwrapped, which is byte for byte what the family noop fn
// computes (identity for pj/pjs/rj/rjs).
func jsonCompositeBody(composite constants.JsonComposite, id string, entryKey string, isLive func(primOp string) bool, wrapRoot bool, circularSkeletonJS string) (contextLines string, innerFn string) {
	// The direct `.fn` read always resolves: a noop primitive registers with the family noop fn pre-set (entryTuple.ts
	// familyMeta), getRT materializes before returning, and demand renders an entry for every primitive a composite wraps.
	// Noop or missing resolution is rtUtils' job: emitted code never carries fallbacks.
	var ctx []string
	resolve := func(name, primOp string) {
		key := operations.PlainHash(primOp) + "_" + id
		ctx = append(ctx, "const "+name+" = utl.getRT("+quoteJS(key)+").fn")
	}
	// wrap passes expr through untouched (no binding, no import, no call) when the primitive is the family identity.
	wrap := func(name, primOp, expr string) string {
		if !isLive(primOp) {
			return expr
		}
		resolve(name, primOp)
		return name + "(" + expr + ")"
	}
	// arrayWrap makes encode emit the valid document "[null]" instead of the bare JS value `undefined` when the root has no
	// top-level JSON form; restoreFromJsonMutate returns undefined for any input, so the round-trip holds unchanged.
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
		case "clone":
			// prepareForJsonClone builds a NEW value from the declared shape, so undeclared keys are dropped with no strip pass.
			body = "return JSON.stringify(" + arrayWrap(wrap("pjsFn", "prepareForJsonClone", "v")) + ");"
		case "mutate":
			body = "return JSON.stringify(" + arrayWrap(wrap("pjFn", "prepareForJsonMutate", "v")) + ");"
		case "compact":
			// compactForJson emits declared props by position with no key names, so it strips undeclared keys like `clone`.
			body = "return JSON.stringify(" + arrayWrap(wrap("cjFn", "compactForJson", "v")) + ");"
		}
		// Armed circular guard: a detected cycle throws before any JSON is produced; pure fn and skeleton are hoisted once
		// into the factory closure.
		if circularSkeletonJS != "" {
			ctx = append(ctx,
				"const "+circularGuardFnAlias+" = utl.getPureFn('"+purefnids.FindCycle+"')",
				"const "+circularGuardContextKey+" = "+circularSkeletonJS)
			body = "const cyR=" + circularGuardFnAlias + "(v," + circularGuardContextKey + ");if(cyR)throw utl.circularError(cyR);" + body
		}
		innerFn = "function " + entryKey + "(v){" + body + "}"
	case "jsonDecoder":
		switch composite.Strategy {
		case "clone":
			// restoreFromJsonClone rebuilds from the declared shape, so undeclared keys are dropped with no strip pass.
			body = "return " + wrap("rjsFn", "restoreFromJsonClone", "JSON.parse(s)") + ";"
		case "mutate":
			body = "return " + wrap("rjFn", "restoreFromJsonMutate", "JSON.parse(s)") + ";"
		case "compact":
			// Inverse of compactForJson: rebuild the keyed object from the positional array JSON.parse produced.
			body = "return " + wrap("cjrFn", "compactFromJson", "JSON.parse(s)") + ";"
		}
		innerFn = "function " + entryKey + "(s){" + body + "}"
	}
	return strings.Join(ctx, ";\n"), innerFn
}

// tryReadCachedCompositeEntry loads a previously written composite arg text from the disk store. The composite
// references only entries sharing runType.ID, so the structural-id check alone proves the baked fnHashes still valid.
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

// writeCachedCompositeEntry persists a composite arg text under its per-strategy tag so repeat builds skip re-rendering.
// Best-effort: failures are swallowed, writeCachedEntry already logs FS misconfigurations on the primitive path.
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

// AssertCompositeSoftDeps verifies the invariant the composite prologues rely on: every primitive bound via
// `utl.getRT(key).fn` has a rendered (non-stub) entry. A miss is an internal bug whose unguarded `.fn` read would crash
// at runtime, so it is reported as a diagnostic at collect time instead. Sorted keys keep the order deterministic.
// provenance (RenderOpts.ProvenanceSites) maps a type id to the call sites that demanded it, and a breach fans out one
// diagnostic per site so it is reproducible from the user's source instead of opaque cache keys. With no known site a
// single file-less diagnostic is still emitted, so the tripwire never goes silent.
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
			// A built-in pure-fn edge binds via `utl.getPureFn`, and serveBuiltinPureFns delivers it AFTER this assertion
			// runs, with its own PFE9012 tripwire for a missing body.
			if purefnids.Has(dep) {
				continue
			}
			if target, ok := graph[dep]; ok && target != nil && target.Kind != entrymodules.KindMissing {
				continue
			}
			_, typeID, ok := splitNamespacedHash(entry.Key)
			if !ok {
				typeID = entry.Key
			}
			sites := provenance[ProvenanceKey(typeID, entry.FamilyTag)]
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
