package typefunctions

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// PureFnDepUse is one pure-fn dependency an entry body reaches, paired with the
// marker call sites that demanded that entry (its root's provenance). The
// resolver drains these into RenderOpts.PureFnDepSink so a missing-dep
// diagnostic (PFE9012) can be anchored at the user's createX<T>() call rather
// than reported file-less. Sites may be empty for a transitively-reached child
// entry with no direct call-site provenance; the resolver falls back to a
// file-less diagnostic then.
type PureFnDepUse struct {
	Dep   protocol.PureFnDep
	Sites []diagnostics.Site
}

// RenderOpts threads the per-session disk cache into the per-entry collectors.
// Zero value is a valid "no caching" configuration — every entry is computed
// fresh and nothing is persisted. The collectors never panic on disk-layer
// errors: a read failure falls through to a fresh compile, a write failure is
// logged once and ignored so a read-only filesystem doesn't break builds.
type RenderOpts struct {
	// Store is the on-disk RT cache. Nil disables caching.
	Store *diskcache.Store
	// Lookup resolves structural ids ↔ short hashes for the current
	// session. Required when Store is non-nil. The resolver passes its
	// runtype.Cache here (which satisfies diskcache.HashLookup).
	Lookup diskcache.HashLookup
	// DiagSink is the destination for compile-time diagnostics emitted
	// by the walker at RTThrow / silent-skip sites. Nil disables
	// diagnostic emission entirely — keeps tests that don't care about
	// the per-call-site fan-out quiet.
	DiagSink *[]diagnostics.Diagnostic
	// PureFnDepSink, when non-nil, accumulates every pure-fn dependency the
	// walker records while rendering a LIVE entry body (walker.PureFnDependencies
	// — e.g. `rt::newRunTypeErr` for a validationErrors body), each paired with
	// the marker call sites that demanded the entry (walker.rootProvenance). The
	// resolver aggregates these across a dispatch and cross-checks each against
	// the program-wide pure-fn registration set; a dep whose registration is
	// missing surfaces PFE9012 ("RT depends on missing pure-fn") anchored at
	// those call sites. Noop, alwaysThrow, and disk-cache-hit entries contribute
	// nothing — they emit no `utl.getPureFn` calls (or the walker never ran) —
	// so a warm disk cache validates only the entries the walk actually
	// recomputed. Nil disables the collection (the common non-linting path).
	// Populated serially per family collect; the parallel fan-out shards it per
	// goroutine (see resolver.collectFamilies) exactly like DiagSink.
	PureFnDepSink *[]PureFnDepUse
	// JSEngine is the JS engine format-pattern checks run on — the
	// validation authority for pattern mockSamples (real `new RegExp`
	// semantics, every lane). Nil means "no engine": pattern checks fail
	// closed with the FMT004 missing-runtime diagnostic.
	JSEngine jsengine.Engine
	// PatternSampleCount mirrors the resolver's pattern mockSample
	// auto-generation knob, and PatternGenFailures the reasons the
	// resolver's enrichment pass (which runs BEFORE the collects and fills
	// the samples) could not generate, keyed by `source \x00 flags`. The
	// pattern emitter's emit-time FMT005 lane reads both to distinguish
	// disabled (count 0) from failed generation — with the demanding call
	// sites available for anchoring.
	PatternSampleCount int
	PatternGenFailures map[string]string
	// ProvenanceSites maps each cached RunType ID to the set of marker
	// call sites that reference it. EmitDiagnostic uses this to fan out
	// one Diagnostic per call site so the user gets actionable file:line:col
	// coordinates — without it, a RTThrow would record a diagnostic
	// with empty Site and the warning would be useless in the editor.
	ProvenanceSites map[string][]diagnostics.Site
	// InlineMode selects the child-inlining policy (constants.InlineMode):
	// default (and the zero value) inlines UNNAMED non-circular compounds
	// into their parents and keeps named types external; allInternal
	// inlines everything except circular types, names ignored. Folded into
	// the disk fingerprint — the two modes never share cache entries.
	InlineMode constants.InlineMode
	// EmitMode selects what each fn entry ships in its code/factory slots:
	//   - EmitCode (default / zero value): only the body `code` string; the
	//     createRTFn slot is the `u` placeholder and the JS-side materializer
	//     rebuilds the factory via `new Function('utl', code)` on first lookup.
	//   - EmitFunctions: only the live `function g_<hash>(utl){…}` factory; the
	//     code slot is `undefined` (runtime derives `code` lazily if read).
	//   - EmitBoth: both (the body twice) — runtimes that disallow `new Function`
	//     (Cloudflare WorkerD, browser CSP without `unsafe-eval`) yet read `.code`.
	EmitMode constants.EmitMode
	// RefTable resolves child ref ids to their RunType during a collect. When
	// non-nil it is used instead of an index built from dump.RunTypes — the
	// resolver passes the FULL session cache here so a collect whose dump.RunTypes
	// is a per-request projection (the scanFiles scope) can always resolve a
	// root's children, even ones interned while scanning a different file. Nil
	// falls back to indexing dump.RunTypes (the unit-test shape).
	RefTable map[string]*reflection.RunType
	// Facts, when non-nil, memoizes the canonical-node subtree predicates
	// (isJsonCompatible / isExtraProof) across every collect of one
	// dispatch. See FactsTable.
	Facts *FactsTable
	// SizeEstimate parameterises the compile-time binary buffer-size estimate
	// baked into every `tb` (binary-encoder) entry — the seed the runtime
	// `dynamic` strategy uses as its cold-start buffer size. Zero-value fields
	// fall back to the constants.DefaultSize* defaults (see
	// SizeEstimateConfig.normalized). Folded into the disk fingerprint so a
	// config change re-derives every estimate.
	SizeEstimate SizeEstimateConfig
}

// familyOp recovers the operation that emits entries under a cache-module's
// family Tag (e.g. "verr" → the validationErrors operation). The fnHash naming scheme
// derives every cache key from the operation registry, NEVER from settings.Tag,
// so this lookup is the single bridge from a CacheModuleSettings to its hashes.
// Panics on an unknown tag — every type-walking family in CacheModules has a
// matching registry operation, so a miss is a programmer error caught in tests.
func familyOp(settings constants.CacheModuleSettings) operations.Operation {
	op, ok := operations.ByFamilyTag(settings.Tag)
	if !ok {
		panic(fmt.Sprintf("typefns: no operation registered for family tag %q", settings.Tag))
	}
	return op
}

// innerPrefix derives the inner-fn name prefix for a cache-module's family from
// the operation registry's plain (default-variant) fnHash — e.g. the validationErrors
// family → `<PlainHash("validationErrors")>_`. The inner validator function inside
// each createRTFn closure is named `<innerPrefix><hash>`; the same prefix
// namespaces the JS cache key (tuple slot 3), and the SAME plain prefix is what
// same-family child dep calls resolve to (so a variant root references plain
// children).
func innerPrefix(settings constants.CacheModuleSettings) string {
	return operations.PlainHash(familyOp(settings).Name) + "_"
}

// variantKey reports the cache-key shape for an emitter + variant suffix +
// runtype id. For the plain variant (empty suffix) this is `<plainFhash>_<id>`;
// for a non-empty suffix it's `<variantFhash>_<id>` — the variant fhash folds
// the option NAMES (carried in `options`) into the hash, so e.g. the
// noIsArrayCheck variant of validate is keyed by FnHashFor(validate, [noIsArrayCheck]).
func variantKey(settings constants.CacheModuleSettings, suffix string, options []string, id string, rejectCircular bool) string {
	op := familyOp(settings)
	if suffix == "" && !rejectCircular {
		return operations.PlainHash(op.Name) + "_" + id
	}
	return operations.FnHashFor(op, options, "", rejectCircular) + "_" + id
}

// childDemand is one item on the collector's child worklist: the child's bare
// type hash plus the variant it must render under. The suffix is empty for
// every family whose variants are root-scoped (all of them but a
// VariantPropagator), which is the pre-existing "children are always plain"
// behaviour.
type childDemand struct {
	hash    string
	suffix  string
	options []string
}

// ExtraRoot is one (type id, variant) the resolver's cross-family fixpoint asks
// a family to render beyond its own call-site demand. The variant fields are
// empty for the common plain edge (`val_<member>`); they carry the referring
// walker's option set when the edge names a VARIANT entry, as the
// validationErrors union arm's delegate does.
type ExtraRoot struct {
	ID            string
	VariantSuffix string
	Options       []string
}

// entryInnerPrefix is the namespace an entry's CHILD dep calls are keyed under.
// It is the family's plain prefix for a plain entry and for a root-scoped
// variant (whose children are the plain family's entries), and the variant's
// own `<variantFhash>_` for a propagating variant, so the whole subtree renders
// and resolves under the variant.
func entryInnerPrefix(settings constants.CacheModuleSettings, emitter Emitter, plainPrefix string, suffix string, options []string, rejectCircular bool) string {
	if suffix == "" || rejectCircular || !propagatesVariant(emitter, options) {
		return plainPrefix
	}
	return operations.FnHashFor(familyOp(settings), options, "", false) + "_"
}

// entryCacheTag is the disk-cache basename an entry is stored under —
// `<typeID>/<tag>.json` for the plain entry, `<typeID>/<tag><suffix>.json` for a
// variant. Distinct basenames are what let a propagating variant be cached at
// all: it renders a whole subtree, so re-walking it on every build (the price
// the root-scoped variants pay) would be the expensive half of this feature.
func entryCacheTag(settings constants.CacheModuleSettings, suffix string) string {
	return settings.Tag + suffix
}

// variantFactoryName builds the outer factory's printed name —
// `g_<variantFhash>_<id>`. The plain branch reduces to `g_<plainFhash>_<id>`
// (= `settings.VarPrefix + id`). Wrapping `variantKey` with the `g_` prefix
// keeps the factory and cache-key shapes in lockstep.
func variantFactoryName(settings constants.CacheModuleSettings, suffix string, options []string, id string, rejectCircular bool) string {
	return "g_" + variantKey(settings, suffix, options, id, rejectCircular)
}

// CollectFamilyEntries compiles one family's demanded cache entries into
// entrymod entries: one per demanded (root, variant) plus the transitive
// closure of same-family child factories they reference. Each entry's module
// Deps carry BOTH the same-family child deps and the cross-family edges
// (`<valHash>_<member>` lookups a decoder / validationErrors body reaches) — the
// per-entry import closure replaces the pre-migration CrossFamilyValRoots
// seeding pass, and the resolver's cross-family fixpoint renders the foreign
// entries those edges name.
//
// extraRoots seeds additional (type-id, variant) roots beyond the family's own
// call-site demand — the resolver's cross-family fixpoint uses it to render the
// `val_<member>` entries other families' bodies reference. Each extra root is
// collected as its own entry plus its same-family closure; the variant fields
// are empty for a plain edge and carry the referring walker's options when the
// edge names a variant entry.
//
// When dump.Sites is empty AND no extraRoots are given, the collector falls
// back to emitting a factory for every interned RunType the emitter supports —
// the unit-test (and embedded-API) shape predating demand scoping.
//
// Pure-fn deps are intentionally NOT module deps: the pure fns a factory body
// reaches register themselves at their own `registerPureFnFactory` call sites
// (binding-injected by the plugin, or live factories without it) when the
// defining module is imported — always before any factory materializes.
func CollectFamilyEntries(dump protocol.Dump, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, opts RenderOpts, extraRoots []ExtraRoot) entrymodules.Graph {
	// Single-pass id→RunType index used by the walker to deref
	// KindRef sentinels at descent time. Cache entries store every
	// child slot as a ref (`{kind: -1, id: …}`) per protocol.go;
	// without the table the walker would dispatch on the ref's
	// placeholder kind and panic. opts.RefTable (the full session cache)
	// wins when provided so a collect resolves children that the per-request
	// dump.RunTypes projection may not contain.
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

	graph := make(entrymodules.Graph, len(dump.RunTypes))

	// renderEntry compiles one (RunType, variant) into the graph and returns
	// its discovered same-family child dependencies. Idempotent via the graph
	// dedup. Composite kinds may reach unsupported child kinds through
	// CompileChild; the compile pass returns CodeNS from any leaf with no emit,
	// compound parents propagate it, and the walker's IsUnsupported flag drops
	// the factory — see codetype.go's CodeNS contract.
	renderEntry := func(runType *reflection.RunType, suffix string, options []string, rejectCircular bool) ([]string, bool) {
		if runType == nil || !emitter.Supports(runType) {
			return nil, false
		}
		entryID := variantKey(settings, suffix, options, runType.ID, rejectCircular)
		if existing, exists := graph[entryID]; exists {
			return existing.Deps, true
		}
		// Prune a JSON primitive (pj/sj/rj/ukuw) for a type whose composite is
		// overridden: the composite redirect references no primitives, so the
		// structural primitive is dead weight — and for a type the structural
		// emitter cannot handle (the escape-valve case) it would alwaysThrow on
		// the very type the user overrode. Safe because the primitives are
		// internal-only, demanded solely by composite sites.
		if compositeOverriddenForPrimitive(runType, settings.Tag) {
			return nil, false
		}
		// Override: a custom function registered for this (family, type) replaces
		// the structural body with a cfn redirect. The PLAIN variant is always
		// overridden; the root-scoped option variants (valNL, …) and the armed
		// circular-guard variant change behaviour the single override fn can't
		// express, so they fall through to structural emit. A PROPAGATING
		// variant does honour it: its option refines HOW the same answer is
		// computed, not what the answer is, and dropping the redirect here would
		// silently lose a user's override at every named nested type the variant
		// now reaches.
		if !rejectCircular && (suffix == "" || propagatesVariant(emitter, options)) {
			if cfnHash := overrideHashForTag(runType, settings.Tag); cfnHash != "" {
				graph.Add(buildRedirectEntry(entryID, settings.Tag, runType, cfnHash, opts))
				return nil, true // a redirect has no same-family child deps
			}
		}
		rendered := renderEntryWithDeps(runType, settings, emitter, entryInnerPrefix(settings, emitter, innerPrefix, suffix, options, rejectCircular), refTable, opts, suffix, options, rejectCircular)
		if rendered.argsText == "" {
			return nil, false
		}
		graph.Add(&entrymodules.Entry{
			Key:       entryID,
			Kind:      entrymodules.KindTypeFn,
			FamilyTag: settings.Tag,
			ArgsText:  rendered.argsText,
			// Same-family deps are HARD (body calls `<dep>.fn(…)`
			// unconditionally → cascade on absence); cross-family edges AND
			// pure-fn edges are SOFT (bodies guard cross-family with
			// `?.fn(…) ?? true`; a pure-fn module registers its own tuple via the
			// deps thunk before the body's `utl.getPureFn(...)` runs). Both ride
			// SoftDeps so the module imports and its deps thunk binds them.
			Deps:     append([]string(nil), rendered.deps...),
			SoftDeps: append(append([]string(nil), rendered.crossFamilyDeps...), rendered.pureFnDeps...),
			IsNoop:   rendered.isNoop,
		})
		return rendered.deps, true
	}

	// enqueueChildren strips the entry's inner prefix off each namespaced
	// dependency hash (e.g. "val_abc" → "abc") so the demand worklist can
	// resolve the child RunType via refTable and render its factory. The parent
	// entry's variant rides along: for a root-scoped variant that is the plain
	// (empty) demand, for a propagating one it is the parent's own option set,
	// so the child renders under the same suffix its dep call names.
	queued := make(map[string]bool)
	var childQueue []childDemand
	enqueueChildren := func(deps []string, suffix string, options []string, rejectCircular bool) {
		childSuffix, childOptions := "", []string(nil)
		if propagatesVariant(emitter, options) {
			childSuffix, childOptions = suffix, options
		}
		prefix := entryInnerPrefix(settings, emitter, innerPrefix, suffix, options, rejectCircular)
		for _, dep := range deps {
			childHash := strings.TrimPrefix(dep, prefix)
			key := childSuffix + "\x00" + childHash
			if childHash == dep || queued[key] {
				continue
			}
			queued[key] = true
			childQueue = append(childQueue, childDemand{hash: childHash, suffix: childSuffix, options: childOptions})
		}
	}

	if len(dump.Sites) > 0 || len(extraRoots) > 0 {
		// Demand-driven: emit only the (root, variant) entries the createX call
		// sites request for this family, plus the transitive closure of child
		// factories they reference. A type only passed to getRunTypeId (or to a
		// different family's createX) leaves no entry here. Children of a
		// root-scoped variant are plain entries (the variant only changes the
		// root body, and its child dep calls resolve to the plain
		// `<fnHash>_<id>`); children of a propagating variant carry the same
		// option set, matching the variant-prefixed dep calls the parent emits.
		demand := collectFamilyDemand(dump.Sites, settings.Tag)
		// Iterate demand roots in a deterministic (sorted) order — Go map
		// iteration is randomized; sorted roots keep walk order (and therefore
		// disk-cache write order / diagnostics order) stable across runs.
		rootIDs := make([]string, 0, len(demand))
		for rootID := range demand {
			rootIDs = append(rootIDs, rootID)
		}
		sort.Strings(rootIDs)
		for _, rootID := range rootIDs {
			root := refTable[rootID]
			if root == nil {
				continue
			}
			demands := demand[rootID]
			sort.Slice(demands, func(i, j int) bool {
				if demands[i].VariantSuffix != demands[j].VariantSuffix {
					return demands[i].VariantSuffix < demands[j].VariantSuffix
				}
				// Plain before armed for a stable, deterministic emit order.
				return !demands[i].RejectCircular && demands[j].RejectCircular
			})
			for _, demanded := range demands {
				if deps, ok := renderEntry(root, demanded.VariantSuffix, demanded.Options, demanded.RejectCircular); ok {
					enqueueChildren(deps, demanded.VariantSuffix, demanded.Options, demanded.RejectCircular)
				}
			}
		}
		// extraRoots seed roots beyond the family's own call sites (the
		// resolver's cross-family fixpoint). Treated exactly like worklist
		// roots so their transitive same-family closure is pulled too. Sorted
		// (copy) for the same determinism reason as the demand roots.
		sortedExtra := append([]ExtraRoot(nil), extraRoots...)
		sort.Slice(sortedExtra, func(i, j int) bool {
			if sortedExtra[i].ID != sortedExtra[j].ID {
				return sortedExtra[i].ID < sortedExtra[j].ID
			}
			return sortedExtra[i].VariantSuffix < sortedExtra[j].VariantSuffix
		})
		for _, extra := range sortedExtra {
			key := extra.VariantSuffix + "\x00" + extra.ID
			if queued[key] {
				continue
			}
			queued[key] = true
			root := refTable[extra.ID]
			if root == nil {
				continue
			}
			if deps, ok := renderEntry(root, extra.VariantSuffix, extra.Options, false); ok {
				enqueueChildren(deps, extra.VariantSuffix, extra.Options, false)
			}
		}
		for len(childQueue) > 0 {
			demanded := childQueue[len(childQueue)-1]
			childQueue = childQueue[:len(childQueue)-1]
			child := refTable[demanded.hash]
			if child == nil {
				continue
			}
			if deps, ok := renderEntry(child, demanded.suffix, demanded.options, false); ok {
				enqueueChildren(deps, demanded.suffix, demanded.options, false)
			}
		}
	} else {
		// Back-compat / unit-test path: no call-site demand for this family.
		// Emit a factory for every interned RunType the emitter supports; the
		// resolver-level cascade prunes any parent whose child kind is
		// unsupported.
		for _, runType := range dump.RunTypes {
			if runType == nil || !emitter.Supports(runType) {
				continue
			}
			renderEntry(runType, "", nil, false)
		}
	}

	return graph
}

// collectFamilyDemand groups, per structural runtype id, the distinct variant
// demands a family receives from createX call sites. The scanner attaches each
// site's structured Demand (computed from the operation registry); only entries
// whose FamilyTag matches familyTag are kept. Dedup is by variant suffix so the
// same type requested with the same options at N call sites yields one entry.
func collectFamilyDemand(sites []protocol.Site, familyTag string) map[string][]protocol.SiteDemand {
	bySuffix := make(map[string]map[string]protocol.SiteDemand)
	// Dedup key folds RejectCircular in so the armed variant is distinct from the
	// plain one even when they share an (empty) VariantSuffix — otherwise the
	// armed entry would collapse into the plain one and lose its guard.
	dedupKey := func(demanded protocol.SiteDemand) string {
		if demanded.RejectCircular {
			return demanded.VariantSuffix + "~C"
		}
		return demanded.VariantSuffix
	}
	for _, site := range sites {
		if site.ID == "" || len(site.Demand) == 0 {
			continue
		}
		for _, demanded := range site.Demand {
			if demanded.FamilyTag != familyTag {
				continue
			}
			if bySuffix[site.ID] == nil {
				bySuffix[site.ID] = make(map[string]protocol.SiteDemand)
			}
			bySuffix[site.ID][dedupKey(demanded)] = demanded
		}
	}
	out := make(map[string][]protocol.SiteDemand, len(bySuffix))
	for id, suffixes := range bySuffix {
		for _, demanded := range suffixes {
			out[id] = append(out[id], demanded)
		}
	}
	return out
}

// entryRender is the result of compiling one (RunType, variant) into its
// tuple argument text. `argsText` is the positional-arg interior (empty when
// the entry is skipped — noop with no body to emit, or an unsupported leaf with
// no per-family diag code). `deps` is the same-family rt-dependency hashes
// (walker.RTDependencies, e.g. "<valHash>_<childHash>") that drive the demand
// worklist; `crossFamilyDeps` is the distinct cross-family RT lookups the body
// reaches (walker.CrossFamilyDeps, e.g. a prepareForJson / toBinary /
// validationErrors entry referencing `<valHash>_<member>` to discriminate a
// union member). Both land on the emitted module's Deps so the import closure
// covers them; crossFamilyDeps additionally feed the resolver's cross-family
// fixpoint, which renders the foreign entries they name. `crossFamilyDeps` is
// populated whether the entry came from a fresh walk OR a disk-cache hit — the
// edges are persisted as CrossFamilyRefs and rebuilt by tryReadCachedEntry.
type entryRender struct {
	argsText        string
	deps            []string
	crossFamilyDeps []string
	// pureFnDeps is the entry's pure-fn dependency KEYS (walker.PureFnDependencies
	// projected to `<ns>::<fn>`, e.g. "rt::newRunTypeErr"). These land on the
	// emitted module's SoftDeps so the built-in (or user) pure-fn module is
	// imported and its tuple registered by the deps thunk before the body runs —
	// the delivery half of demand-driven built-in pure fns. Persisted as
	// diskcache.PureFnRefs and rebuilt on a warm hit (stable string keys, no hash
	// translation). Populated only on the live path; noop / alwaysThrow / redirect
	// entries reach no pure fn.
	pureFnDeps []string
	// isNoop mirrors the walker's Finalize verdict (the short-form tuple
	// whose runtime fn is the family identity). Landed on
	// entrymodules.Entry.IsNoop so downstream consumers (the JSON composite
	// collector) can elide references to identity entries.
	isNoop bool
}

// renderEntryWithDeps compiles one RunType into its tuple argument text and
// returns the discovered dependency hashes alongside (see entryRender). Inner
// function name is `<innerPrefix><hash>` (e.g. "<valHash>_abc123"); the
// outer factory's debug name (`g_<key>`) is used only as the closure's printed
// name so consumers see the same identity in stack traces. Noop bodies return
// the short-form arg text; unsupported leaves either produce an alwaysThrow
// entry (when the emitter registers a diag code) or skip silently.
//
// When `variantSuffix` is non-empty (e.g. "NA"), the entry is rendered
// under the variant cache key `<variantFhash>_<id>` and the walker is primed
// with `VariantOptions` so the emitter's per-kind dispatch can branch.
// Variants share child references with the plain entry — `InnerPrefix`
// stays at the plain hash so child dep calls resolve to plain factories.
//
// When opts.Store is non-nil and opts.Lookup is provided, the function
// first checks the on-disk cache at <store>/<runType.ID>/<settings.Tag>.json.
// A header structural-id mismatch, or any cached child-ref whose
// structural id no longer maps to the same short hash, is treated as
// a miss; we then fall through to the walker as usual and write the
// fresh result back. Read/write errors are non-fatal — the collector
// always produces output even when the cache is broken.
func renderEntryWithDeps(runType *reflection.RunType, settings constants.CacheModuleSettings, emitter Emitter, innerPrefix string, refTable map[string]*reflection.RunType, opts RenderOpts, variantSuffix string, variantOptions []string, rejectCircular bool) entryRender {
	factoryName := variantFactoryName(settings, variantSuffix, variantOptions, runType.ID, rejectCircular)
	innerName := variantKey(settings, variantSuffix, variantOptions, runType.ID, rejectCircular)

	// Who gets a disk cache. The plain entry always does. A PROPAGATING variant
	// does too — it renders the whole transitive subtree, so re-walking it every
	// build would cost far more than the root-only variants do — and its entries
	// live under their own basename (`<tag><suffix>.json`) so they never collide
	// with the plain body for the same type. A root-scoped option variant is a
	// single extra root entry, cheap to re-render, and stays session-rendered.
	// The armed circular variant shares the PLAIN basename (empty suffix) with a
	// different body, so it must never read or write that cache.
	cacheTag := entryCacheTag(settings, variantSuffix)
	diskCacheable := !rejectCircular && (variantSuffix == "" || propagatesVariant(emitter, variantOptions))
	if diskCacheable {
		if cached, ok := tryReadCachedEntry(runType, settings, cacheTag, innerPrefix, opts); ok {
			// Disk-cache hit: the walker never runs, but the entry's
			// cross-family edges were persisted as CrossFamilyRefs and
			// rebuilt here (see tryReadCachedEntry / writeCachedEntry), so
			// the hit returns the same crossFamilyDeps a fresh walk would
			// (and the same isNoop verdict, persisted as RTEntry.IsNoop).
			return cached
		}
	}

	// Where this entry's diagnostics start in the shared sink. The walk appends
	// to it, so the tail from here on is exactly what THIS entry produced —
	// which is what gets persisted so a warm build can replay it.
	diagStart := 0
	if opts.DiagSink != nil {
		diagStart = len(*opts.DiagSink)
	}

	walker := NewWalker(runType, innerName, emitter)
	walker.inlineCtx.InlineAllInternal = opts.InlineMode.AllInternal()
	walker.RefTable = refTable
	walker.facts = opts.Facts
	// InnerPrefix lets dispatch namespace child cache keys consistently
	// with the tuple's key slot (innerName below). Variant walkers still
	// set this to the plain hash so child deps resolve to the plain
	// entries — the variant only changes the ROOT body, not its children.
	walker.InnerPrefix = innerPrefix
	walker.OverrideOpKey = overrideOpKeyForTag(settings.Tag)
	if len(variantOptions) > 0 {
		walker.VariantOptions = make(map[string]bool, len(variantOptions))
		for _, name := range variantOptions {
			walker.VariantOptions[name] = true
		}
	}
	// Prime the walker for the armed circular-guard variant: compute the baked
	// skeleton (nil for an acyclic type, where the guard is a no-op) and Compile
	// prepends the inline guard. A non-nil skeleton also forces the entry
	// non-noop below so the guarded body always ships.
	var circularSkeleton *CircularSkeleton
	if rejectCircular {
		circularSkeleton = BuildCircularSkeleton(runType, refTable)
		walker.RejectCircular = true
		walker.CircularSkeleton = circularSkeleton
	}
	// Wire diagnostic emission for this walk. EmitDiagnostic fans each
	// recorded code out across every call site referencing this RT.
	walker.DiagSink = opts.DiagSink
	walker.JSEngine = opts.JSEngine
	walker.PatternSampleCount = opts.PatternSampleCount
	walker.PatternGenFailures = opts.PatternGenFailures
	if opts.ProvenanceSites != nil {
		walker.rootProvenance = opts.ProvenanceSites[runType.ID]
	}
	innerFn, shapeNoop, isUnsupported := walker.Compile()
	if isUnsupported {
		// Compile reached an unsupported leaf and the parent positions
		// chose to propagate (not absorb). Render an alwaysThrow factory
		// keyed by the leaf's per-family diag code so the JS-side tuple
		// consumer can materialise a throwing factory with the catalog
		// message. Surface the same code as a build-time diagnostic against
		// every call site referencing this RT — users see the cause at build
		// time AND at runtime.
		//
		// Fallback to silent skip when the emitter registers no code
		// for the leaf — preserves the safety net for unknown future
		// kinds (the runtime cache miss is caught by createXxx<T>'s
		// identity fallback, via the KindMissing stub module).
		if leafProvider, ok := emitter.(LeafDiagCodeProvider); ok && walker.UnsupportedLeaf != nil {
			// A callable interface (objectLiteral carrying a call signature) is
			// function-like everywhere — the serializer emitters return CodeNS for
			// it via objectHasCallSignature, latching the OBJECTLITERAL as the
			// unsupported leaf. DiagCodeForLeaf only maps KindFunction/KindMethod/
			// KindCallSignature to the family's function code, so the objectLiteral
			// would resolve to "" and the entry would be SILENTLY SKIPPED — leaving
			// a dangling same-family dep that cascades to a missing stub, which a
			// JSON composite then binds with an unguarded getRT(key).fn (runtime
			// `reading 'fn'`) or a binary site can't resolve ("no id injected").
			// Substitute the call-signature child so the function code is emitted
			// and the entry renders as an alwaysThrow, exactly like a bare function.
			diagLeaf := callableLeafSubstitute(walker.UnsupportedLeaf, walker.RefTable)
			if diagCode := leafProvider.DiagCodeForLeaf(diagLeaf); diagCode != "" {
				kindLabel := leafKindLabel(diagLeaf)
				walker.EmitDiagnostic(diagCode, kindLabel)
				argsText := renderAlwaysThrowEntry(runType, innerName, diagCode, kindLabel, walker.rootProvenance)
				if diskCacheable {
					// alwaysThrow entries emit no dep calls — no same-family
					// or cross-family edges to persist.
					writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, nil, nil, nil, false, entryDiagnostics(diagStart, opts), opts)
				}
				return entryRender{argsText: argsText}
			}
		}
		return entryRender{}
	}
	// The noop VERDICT is decided over the TYPE GRAPH — the family's
	// IsNoopType predicate — never by inspecting the emitted text. The
	// compiled body's shape (Finalize's bool) survives only as the
	// protective tripwire below: a predicate that claims identity while the
	// body disagrees would make the runtime substitute the family noop over
	// a real transform (silent data corruption), so the mismatch ships the
	// LIVE body and logs loudly instead. The tripwire can only demote
	// noop→live; text never produces a noop verdict. (Hand-built test
	// emitters without a predicate keep the shape verdict.)
	isNoop := shapeNoop
	if circularSkeleton != nil {
		// Armed circular entry: it always ships the full guarded body, never the
		// noop short-form (the guard prologue must run). Skip the noop predicate
		// so the (possibly identity) underlying transform can't collapse it.
		isNoop = false
	} else if predicate, ok := emitter.(NoopTypePredicate); ok {
		predicateCtx := walker.getEmitContext(walker.Vλl)
		isNoop = predicate.IsNoopType(runType, predicateCtx)
		walker.putEmitContext(predicateCtx)
		if isNoop && !shapeNoop {
			fmt.Fprintf(os.Stderr,
				"mion: noop-predicate mismatch for %s_%s (%s): IsNoopType claims identity but the compiled body is not — shipping the live body; fix the predicate arm to mirror the emitter\n",
				settings.Tag, runType.ID, rtTypeName(runType))
			isNoop = false
		}
	}
	// Noop factories emit a SHORT-FORM tuple tail: only the cache key,
	// typeName, and isNoop=true are passed. The JS-side consumer builds
	// the entry with a family-specific identity `fn` (`() => true` for
	// validate, `(v, pth, er) => er` for validationErrors, `(v) => v` for
	// prepareForJson / restoreFromJson, native JSON for the composites) and
	// leaves `code`, `rtDependencies`, `pureFnDependencies`, and
	// `createRTFn` as undefined. Same dep-call wiring works — a parent
	// referencing the noop entry's `<hash>.fn(v)` still hits a real
	// function — without the per-entry payload bloat of an inlined
	// `return v` body.
	if isNoop {
		args := []string{
			quoteJS(innerName),
			quoteJS(rtTypeName(runType)),
			"undefined", // code — holed below (runtime uses the family noop identity)
			"true",      // isNoop — kept: the signal that selects the noop fn
		}
		argsText := joinArgs(holeifyArgs(args))
		if diskCacheable {
			// A noop body emits no dep calls, so no same-family or
			// cross-family lookups are registered.
			writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, nil, nil, nil, true, entryDiagnostics(diagStart, opts), opts)
		}
		return entryRender{argsText: argsText, isNoop: true}
	}
	createRTFn, factoryBody := WrapClosure(factoryName, walker.FnName, innerFn, walker.ContextLines())
	// The `code` arg carries the factory BODY — the contents between the
	// `function(utl){ … }` braces — so a consumer holding only the
	// serialized RTCompiledFnData can rebuild the validator via
	// `new Function('utl', code)(rtUtils)`. The inner-validator body
	// remains embedded in `code` (as `return function …(v){…}`).
	//
	// The code (slot 2) and createRTFn (slot 6) slots vary by emit mode;
	// holeifyArgs then empties every default-valued slot (interior ones too):
	//   - EmitCode (default): code string, `u` factory placeholder. The
	//     JS-side materializeRTFn rebuilds the factory from `code` on first
	//     `getRT(hash)` call. The all-default tail (`false,[],[],u`) holes out,
	//     so the common dep-less entry ends at the `code` slot.
	//   - EmitFunctions: `undefined` code, live factory. The runtime uses the
	//     factory directly and derives `code` lazily only if a consumer reads it.
	//     The factory (slot 6) blocks a trailing trim, so the interior code /
	//     isNoop / dep-list slots become holes rather than spelled-out defaults.
	//   - EmitBoth: code string + live factory (the body twice) for runtimes
	//     without `new Function` that still read `.code`.
	//
	// First arg is the namespaced cache key (innerPrefix + runType.ID) ==
	// the entry-module key, so the JS-side rtFnsCache slot is distinct from
	// the same runtype's other-family entries.
	codeArg := "undefined"
	if opts.EmitMode.EmitsCode() {
		codeArg = quoteJS(factoryBody)
	}
	createRTFnArg := "u"
	if opts.EmitMode.EmitsFactory() {
		createRTFnArg = createRTFn
	}
	tail := []string{
		quoteJS(innerName),
		quoteJS(rtTypeName(runType)),
		codeArg,
		boolJS(isNoop),
		stringSliceJS(walker.RTDependencies),
		pureFnDepsJS(walker.PureFnDependencies),
		createRTFnArg,
	}
	var args []string
	if estimate := binaryColdStartEstimate(settings, variantSuffix, runType, refTable, opts.SizeEstimate); estimate > 0 {
		// tb entry: the cold-start size rides slot 11 (binarySizeEstimate),
		// after the alwaysThrowMessage slot. holeifyArgs empties the default
		// interior slots (including the `u`/undefined createRTFn placeholder,
		// which is never a standalone binding) while KEEPING the estimate at its
		// fixed index — holes preserve positions, so the estimate never shifts.
		args = holeifyArgs(append(tail, "undefined", strconv.Itoa(estimate))) // slot 10 alwaysThrowMessage, slot 11 estimate
	} else {
		args = holeifyArgs(tail)
	}
	deps := append([]string(nil), walker.RTDependencies...)
	crossFamilyDeps := append([]string(nil), walker.CrossFamilyDeps...)
	// Surface this live body's pure-fn dependencies for build-time validation
	// (PFE9012). Only the live path reaches here — noop / alwaysThrow entries
	// and disk-cache hits returned earlier, and none of them emit getPureFn
	// calls, so this is the complete set of deps a fresh walk contributes. Each
	// dep carries this root's marker call sites so a missing one squiggles at
	// the user's createX<T>() call.
	if opts.PureFnDepSink != nil {
		for _, dep := range walker.PureFnDependencies {
			*opts.PureFnDepSink = append(*opts.PureFnDepSink, PureFnDepUse{Dep: dep, Sites: walker.rootProvenance})
		}
	}
	pureFnDeps := pureFnDepKeys(walker.PureFnDependencies)
	argsText := joinArgs(args)
	if diskCacheable {
		writeCachedEntry(runType, settings, cacheTag, innerPrefix, argsText, deps, crossFamilyDeps, pureFnDeps, false, entryDiagnostics(diagStart, opts), opts)
	}
	return entryRender{argsText: argsText, deps: deps, crossFamilyDeps: crossFamilyDeps, pureFnDeps: pureFnDeps}
}

// entryDiagnostics slices the findings THIS entry's walk appended to the shared
// sink (everything from diagStart on) down to the code + args pair the cache
// persists. The site is dropped on purpose: it belongs to the build that
// produced it, and a later build re-attaches its own provenance on the hit.
func entryDiagnostics(diagStart int, opts RenderOpts) []diskcache.CachedDiagnostic {
	if opts.DiagSink == nil || len(*opts.DiagSink) <= diagStart {
		return nil
	}
	emitted := (*opts.DiagSink)[diagStart:]
	// One finding can already be fanned out across several call sites; the cache
	// wants each DISTINCT finding once, and the replay re-fans it.
	seen := make(map[string]bool, len(emitted))
	out := make([]diskcache.CachedDiagnostic, 0, len(emitted))
	for _, diagnostic := range emitted {
		key := diagnostic.Code + "\x00" + strings.Join(diagnostic.Args, "\x01")
		if seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, diskcache.CachedDiagnostic{Code: diagnostic.Code, Args: append([]string(nil), diagnostic.Args...)})
	}
	return out
}

// pureFnDepKeys projects the walker's recorded PureFnDep triples down to the
// `<ns>::<fn>` graph keys the SoftDeps / disk cache carry (FilePath is a Go-only
// validation hint, dropped here exactly like pureFnDepsJS drops it).
func pureFnDepKeys(deps []protocol.PureFnDep) []string {
	if len(deps) == 0 {
		return nil
	}
	keys := make([]string, len(deps))
	for i, dep := range deps {
		keys[i] = dep.Namespace + "::" + dep.FunctionName
	}
	return keys
}

// tryReadCachedEntry attempts to load a previously cached entryRender
// (argsText, deps, crossFamilyDeps, isNoop) from the disk store. Returns
// ok=false on miss for any reason: no store wired, missing file, malformed
// file, header structural-id mismatch (hash drift), or any child OR
// cross-family ref whose hash has changed since write time.
//
// Cached deps are rebuilt from ChildRefs by translating each
// (structural id, hash) back to the namespaced form
// (innerPrefix + hash) the demand worklist expects. Cross-family deps are
// rebuilt from CrossFamilyRefs the same way, except each ref carries its
// OWN (foreign) prefix — the reconstructed dep is `ref.Prefix +
// currentHash`. Because both read-time hash checks guarantee structural
// id → hash agreement, these translations are lossless; a cache hit
// returns the exact entryRender the fresh walk would have produced.
func tryReadCachedEntry(runType *reflection.RunType, settings constants.CacheModuleSettings, cacheTag string, innerPrefix string, opts RenderOpts) (entryRender, bool) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return entryRender{}, false
	}
	expectedStructural := opts.Lookup.StructuralForHash(runType.ID)
	if expectedStructural == "" {
		// Not interned in the current build — should not happen because
		// renderEntryWithDeps is called for entries that ARE in the
		// current dump, but guard anyway: a missing reverse mapping
		// means we cannot verify the file safely.
		return entryRender{}, false
	}
	entry, ok, err := opts.Store.ReadRT(runType.ID, cacheTag)
	if err != nil || !ok || entry == nil {
		return entryRender{}, false
	}
	if entry.StructuralID != expectedStructural {
		return entryRender{}, false
	}
	deps := make([]string, 0, len(entry.ChildRefs))
	for _, ref := range entry.ChildRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// Child's structural id has been re-hashed (collision
			// extension) or removed entirely — cached body's baked
			// hash is stale.
			return entryRender{}, false
		}
		deps = append(deps, innerPrefix+currentHash)
	}
	crossFamilyDeps := make([]string, 0, len(entry.CrossFamilyRefs))
	for _, ref := range entry.CrossFamilyRefs {
		currentHash := opts.Lookup.HashForStructural(ref.StructuralID)
		if currentHash == "" || currentHash != ref.Hash {
			// Same drift rule as ChildRefs: the referenced member's hash
			// changed across builds, so the whole entry is stale.
			return entryRender{}, false
		}
		crossFamilyDeps = append(crossFamilyDeps, ref.Prefix+currentHash)
	}
	// Pure-fn edges rebuild verbatim from the persisted stable keys — no hash
	// drift to check (the delivery target is content-addressed by key, not id).
	pureFnDeps := append([]string(nil), entry.PureFnRefs...)
	replayCachedDiagnostics(runType, entry.Diagnostics, opts)
	return entryRender{argsText: entry.ArgsText, deps: deps, crossFamilyDeps: crossFamilyDeps, pureFnDeps: pureFnDeps, isNoop: entry.IsNoop}, true
}

// replayCachedDiagnostics re-emits an entry's persisted findings on a cache hit,
// against THIS build's provenance. Without it the walker's silence on a hit
// meant a project's warnings disappeared from the second build onward and only
// came back after wiping node_modules/.cache/ts-runtypes — a stale-looking
// clean build that was really just a cached one.
//
// Provenance comes from the live call sites, never from the cache: the same type
// can be demanded from different places on the next build, and a stale file:line
// would point at nothing. An entry whose call sites are gone emits nothing here,
// matching the fresh-walk behaviour.
func replayCachedDiagnostics(runType *reflection.RunType, cached []diskcache.CachedDiagnostic, opts RenderOpts) {
	if len(cached) == 0 || opts.DiagSink == nil || runType == nil {
		return
	}
	sites := opts.ProvenanceSites[runType.ID]
	if len(sites) == 0 {
		return
	}
	for _, entryDiag := range cached {
		for _, site := range sites {
			*opts.DiagSink = append(*opts.DiagSink, diagnostics.New(entryDiag.Code, site, entryDiag.Args...))
		}
	}
}

// splitNamespacedHash splits a namespaced cache hash into its family
// prefix (everything up to and including the first `_`, e.g. "<valHash>_") and
// the bare hash (the rest). Reports ok=false when there is no `_`
// separator — such an id can't be reconstructed as prefix+hash on read.
func splitNamespacedHash(namespaced string) (prefix string, bareHash string, ok bool) {
	idx := strings.IndexByte(namespaced, '_')
	if idx < 0 {
		return "", "", false
	}
	return namespaced[:idx+1], namespaced[idx+1:], true
}

// writeCachedEntry persists the freshly-rendered (argsText, deps,
// crossFamilyDeps, isNoop) tuple so the next build can skip the walker for
// this (typeID, fnTag) AND still reconstruct its cross-family edges and
// noop verdict on a hit.
// Failures are logged once to stderr and otherwise ignored — a read-only
// or out-of-space FS shouldn't break the build, and the next run will
// re-attempt the write.
//
// deps here are the namespaced rt-dependency hashes
// (walker.RTDependencies, e.g. "<valHash>_<childHash>"). We strip the prefix
// to recover the bare childHash and look up its structural id for the
// ChildRefs record. crossFamilyDeps (walker.CrossFamilyDeps) are
// foreign-prefixed namespaced hashes; we split each into its prefix (up to
// and including the first `_`) and bare hash, resolve the bare hash to its
// structural id, and store the triple as a CrossFamilyRef. As with
// ChildRefs, an unresolvable ref aborts the write cleanly rather than
// persisting a record the reader can't verify.
func writeCachedEntry(runType *reflection.RunType, settings constants.CacheModuleSettings, cacheTag string, innerPrefix string, argsText string, deps []string, crossFamilyDeps []string, pureFnDeps []string, isNoop bool, entryDiags []diskcache.CachedDiagnostic, opts RenderOpts) {
	if opts.Store == nil || opts.Lookup == nil || runType == nil || runType.ID == "" {
		return
	}
	structural := opts.Lookup.StructuralForHash(runType.ID)
	if structural == "" {
		return
	}
	childRefs := make([]diskcache.ChildRef, 0, len(deps))
	for _, dep := range deps {
		childHash := strings.TrimPrefix(dep, innerPrefix)
		if childHash == dep {
			// Defensive: a dep that doesn't start with innerPrefix
			// breaks the read-time hash translation. Skip writing
			// rather than persist a record we can't safely verify.
			return
		}
		childStructural := opts.Lookup.StructuralForHash(childHash)
		if childStructural == "" {
			return
		}
		childRefs = append(childRefs, diskcache.ChildRef{
			StructuralID: childStructural,
			Hash:         childHash,
		})
	}
	crossFamilyRefs := make([]diskcache.CrossFamilyRef, 0, len(crossFamilyDeps))
	for _, dep := range crossFamilyDeps {
		prefix, bareHash, ok := splitNamespacedHash(dep)
		if !ok {
			// No `_` separator — can't recover a (prefix, hash) pair.
			// Abort the write rather than persist an unchecked record.
			return
		}
		crossStructural := opts.Lookup.StructuralForHash(bareHash)
		if crossStructural == "" {
			return
		}
		crossFamilyRefs = append(crossFamilyRefs, diskcache.CrossFamilyRef{
			Prefix:       prefix,
			StructuralID: crossStructural,
			Hash:         bareHash,
		})
	}
	entry := diskcache.RTEntry{
		Format:          diskcache.FormatVersion,
		StructuralID:    structural,
		ArgsText:        argsText,
		IsNoop:          isNoop,
		ChildRefs:       childRefs,
		CrossFamilyRefs: crossFamilyRefs,
		// Pure-fn keys are stable strings — persist verbatim, no structural-id
		// translation (contrast ChildRefs / CrossFamilyRefs).
		PureFnRefs: append([]string(nil), pureFnDeps...),
		// So a warm build reports the same findings a cold one does.
		Diagnostics: entryDiags,
	}
	if err := opts.Store.WriteRT(runType.ID, cacheTag, entry); err != nil {
		// Best-effort: report once per session would be ideal, but
		// keep it simple — fmt.Fprintln on the first failure is
		// enough to surface FS-permission misconfigurations without
		// spamming.
		fmt.Fprintln(os.Stderr, "mion: disk-cache write failed:", err)
	}
}

// leafKindLabel returns a short human-readable label for an unsupported
// leaf RunType — passed as the {0} substitution arg in the JS-side
// catalog template for root-throw diagnostics. The label is family-
// independent ("Never", "Symbol", "Function", …); per-family wording
// lives in the catalog entry's headline/detail text.
func leafKindLabel(leaf *reflection.RunType) string {
	if leaf == nil {
		return "Unsupported"
	}
	switch leaf.Kind {
	case reflection.KindNever:
		return "Never"
	case reflection.KindSymbol:
		return "Symbol"
	case reflection.KindPromise:
		return "Promise"
	case reflection.KindFunction,
		reflection.KindMethod,
		reflection.KindMethodSignature,
		reflection.KindCallSignature:
		return "Function"
	case reflection.KindClass:
		if leaf.SubKind == reflection.SubKindNonSerializable {
			return "NonSerializableClass"
		}
		return "Class"
	}
	return "Unsupported"
}

// renderAlwaysThrowEntry emits the structured alwaysThrow tuple tail. The
// final positional argument is the COMPLETE runtime throw message, rendered
// here at build time from the diag catalog (buildAlwaysThrowMessage) — the
// shipped marker package throws it verbatim, with no catalog to resolve at
// runtime.
//
// Shape (relative to the normal 7-arg tail): every interior slot between
// typeName and the message is a hole (holeifyArgs collapses the `undefined` /
// `false` defaults), and the runtime derives the throwing factory from the
// message slot:
//
//	'<hash>', '<typeName>',
//	,           // code (hole)
//	,           // isNoop (hole → false)
//	,           // rtDependencies (hole)
//	,           // pureFnDependencies (hole)
//	,           // createRTFn (hole → JS-side derives the throwing factory)
//	'<message>' // alwaysThrowMessage
//
// (disk cache format v10)
func renderAlwaysThrowEntry(runType *reflection.RunType, innerName string, diagCode string, kindLabel string, provenance []diagnostics.Site) string {
	args := []string{
		quoteJS(innerName),
		quoteJS(rtTypeName(runType)),
		"undefined", // code
		"false",     // isNoop
		"undefined", // rtDependencies
		"undefined", // pureFnDependencies
		"undefined", // createRTFn
		quoteJS(buildAlwaysThrowMessage(diagCode, kindLabel, provenance)),
	}
	return joinArgs(holeifyArgs(args))
}

// buildAlwaysThrowMessage renders the complete runtime throw text for an
// alwaysThrow entry: `[<code>] <headline> (at <file:line:col>)`. The headline
// is rendered here by the emitter (rootThrowHeadline) with its kind label, so
// the runtime throws this string as-is — no diagnostic catalog ships in the
// marker package. The site suffix is omitted for orphaned entries (no known
// call site).
func buildAlwaysThrowMessage(diagCode, kindLabel string, provenance []diagnostics.Site) string {
	message := "[" + diagCode + "] " + rootThrowHeadline(diagCode, kindLabel)
	if len(provenance) > 0 {
		site := provenance[0]
		message += fmt.Sprintf(" (at %s:%d:%d)", site.FilePath, site.StartLine, site.StartCol)
	}
	return message
}

// rtTypeName resolves the `typeName` field for a RTCompiledFn entry.
// We use the RunType's declared TypeName when present; for anonymous
// atomics it falls back to a name derived from the kind. Names mirror
// the ReflectionKindName table at
// (ref: packages/run-types/src/constants.kind.ts).
func rtTypeName(runType *reflection.RunType) string {
	if runType.TypeName != "" {
		return runType.TypeName
	}
	if runType.Kind == reflection.KindClass {
		switch runType.SubKind {
		case reflection.SubKindDate:
			return "date"
		case reflection.SubKindMap:
			return "map"
		case reflection.SubKindSet:
			return "set"
		}
	}
	switch runType.Kind {
	case reflection.KindAny:
		return "any"
	case reflection.KindUnknown:
		return "unknown"
	case reflection.KindNever:
		return "never"
	case reflection.KindVoid:
		return "void"
	case reflection.KindNull:
		return "null"
	case reflection.KindUndefined:
		return "undefined"
	case reflection.KindString:
		return "string"
	case reflection.KindNumber:
		return "number"
	case reflection.KindBoolean:
		return "boolean"
	case reflection.KindBigInt:
		return "bigint"
	case reflection.KindSymbol:
		return "symbol"
	case reflection.KindObject:
		// The ReflectionKindName maps deepkit's KindObject (4) to
		// 'objectLiteral'; the atomic node lives at nodes/atomic/object.ts.
		return "objectLiteral"
	case reflection.KindRegexp:
		return "regexp"
	case reflection.KindLiteral:
		return "literal"
	case reflection.KindEnum:
		return "enum"
	case reflection.KindArray:
		return "array"
	case reflection.KindObjectLiteral:
		return "objectLiteral"
	case reflection.KindClass:
		return "class"
	case reflection.KindProperty:
		return "property"
	case reflection.KindPropertySignature:
		return "propertySignature"
	case reflection.KindIndexSignature:
		return "indexSignature"
	case reflection.KindFunction:
		return "function"
	case reflection.KindMethod:
		return "method"
	case reflection.KindMethodSignature:
		return "methodSignature"
	case reflection.KindCallSignature:
		return "callSignature"
	case reflection.KindTuple:
		return "tuple"
	case reflection.KindTupleMember:
		return "tupleMember"
	case reflection.KindUnion:
		return "union"
	case reflection.KindTemplateLiteral:
		return "templateLiteral"
	case reflection.KindPromise:
		return "promise"
	}
	return ""
}

// boolJS emits the JS literal for b.
func boolJS(b bool) string {
	if b {
		return "true"
	}
	return "false"
}

// fnEntryArgHoles maps a tail slot index to the rendered values that read
// back IDENTICALLY as a JS array hole (undefined) once the JS-side
// tupleToRecord zips the tuple and registration re-derives the entry: `code`
// is rebuilt from `createRTFn` in EmitFunctions mode, `isNoop` defaults to
// false, the dep lists are build-only metadata never iterated at runtime, the
// `createRTFn` placeholder degrades to undefined, and an absent
// alwaysThrowMessage means no-throw. Replacing such a value with a hole ("")
// drops its literal bytes even when the slot is INTERIOR — a later non-default
// slot (the live factory in EmitFunctions/EmitBoth, or the `tb` size estimate)
// would otherwise block the trailing trim and leave `undefined,false,[],[]`
// spelled out. Slots absent from the map (the cache key, typeName, and the tb
// size estimate) are never holed. Indices match the full entry tail
// (0 key, 1 typeName, 2 code, 3 isNoop, 4 rtDependencies,
// 5 pureFnDependencies, 6 createRTFn, 7 alwaysThrowMessage).
var fnEntryArgHoles = map[int][]string{
	2: {"undefined"},       // code — derived from createRTFn in functions mode
	3: {"false"},           // isNoop — a hole reads as not-noop
	4: {"[]", "undefined"}, // rtDependencies — build-only metadata, never iterated
	5: {"[]", "undefined"}, // pureFnDependencies — same
	6: {"u", "undefined"},  // createRTFn — placeholder / derived from code
	7: {"undefined"},       // alwaysThrowMessage — a hole reads as no-throw
}

// holeifyArgs replaces every slot holding a hole-equivalent value (see
// fnEntryArgHoles) with a JS array hole (""), then drops the trailing run of
// holes. Subsumes the old trailing-only trim: trailing defaults become holes
// and are trimmed, while INTERIOR defaults are holed in place (positions
// preserved, so a trailing non-default slot — the tb estimate — still lands at
// its fixed index). The runtime tolerates a hole at every one of these slots.
func holeifyArgs(args []string) []string {
	out := append([]string(nil), args...)
	for i := range out {
		for _, holeable := range fnEntryArgHoles[i] {
			if out[i] == holeable {
				out[i] = ""
				break
			}
		}
	}
	end := len(out)
	for end > 0 && out[end-1] == "" {
		end--
	}
	return out[:end]
}

// joinArgs concatenates positional args with bare commas. The
// createRTFn arg is multi-line; padding around commas would not align
// readably across long entries, so emit them flush. Also used for
// path-literal segments (EmitContext.AccessPathLiteral) — the len-1
// fast path keeps that common single-segment case allocation-free.
func joinArgs(args []string) string {
	switch len(args) {
	case 0:
		return ""
	case 1:
		return args[0]
	}
	total := len(args) - 1
	for _, a := range args {
		total += len(a)
	}
	b := make([]byte, 0, total)
	for i, a := range args {
		if i > 0 {
			b = append(b, ',')
		}
		b = append(b, a...)
	}
	return string(b)
}
