// Package disk persists per-(typeID, fnTag) RT artifacts under
// node_modules/.cache/mion/<optsFingerprint>/<typeID>/<fnTag>.json
// so subsequent builds can skip the walker for unchanged types.
//
// Layout invariants (see plan):
//   - Directory name = the short hash (runType.ID) so the filesystem path
//     is identical to the identifier consumers see in emitted JS.
//   - File basename = the cache-module Tag (constants.CacheModules[…].Tag),
//     e.g. "val.json" for validate, "verr.json" for validationErrors.
//   - Filename never encodes the version. Version is folded into the typeID
//     hash itself (see internal/cachegen/runtype.Cache.uniqueDict), so
//     cross-version typeIDs are already distinct paths.
//   - <optsFingerprint> isolates caches across non-version build options
//     (hashLength, emitCreateRTFn). Version is NOT in this fingerprint
//     for the same reason.
//
// Every cached entry carries a header recording the structural id of the
// entry itself plus the (structural id, hash) of every child referenced
// in the cached factory body. At read time the disk layer re-resolves
// each structural id against the live runtype.Cache; any mismatch
// (different short hash, missing entry, structural drift) is treated as
// a miss and the renderer re-runs the walker.
package diskcache

// FormatVersion identifies the on-disk JSON layout. Bump whenever the
// RTEntry shape changes incompatibly so stale files written by an older
// binary aren't misread.
//
// v2 added CrossFamilyRefs so a cache hit can reconstruct the entry's
// cross-family `val_<member>`-style edges (previously the collection pass
// in typefns.CrossFamilyValRoots had to bypass the disk cache to observe
// them via the walker). v1 files lack the field, so they (correctly)
// become misses under v2 — a hit returning empty crossFamilyDeps would
// silently break unions on cached production builds.
//
// v3 is the hashed-naming flip: every cached `Line` and `CrossFamilyRef.Prefix`
// now embeds an opaque fnHash (e.g. `WMk0_<id>`) instead of the readable family
// tag (`val_<id>`). v2 files bake the old tag-based keys, so a hit would feed the
// runtime keys it no longer registers — they must become misses.
//
// v4 redefines the `clone` JSON-encoder strategy: its composite body now wraps
// prepareForJsonSafe (shape-derived strip) instead of prepareForJsonSafePreserve
// (preserve extras), while its fnHash is unchanged (the strategy token "clone" is
// the same). A v3 `jeCL` entry bakes the old preserve body, so a hit would emit
// the wrong (extras-preserving) encoder — it must become a miss.
//
// v5 is the per-entry virtual-module migration: the cached payload is now the
// tuple ARGUMENT TEXT (`ArgsText` — the interior of the emitted entry tuple,
// cache key onward) instead of a full `init(…);` statement, and pure-fn
// dependency arrays inside it are always fully quoted (the skeleton-scoped
// `k_<alias>` consts no longer exist). v4 `Line` payloads can't be spliced
// into a tuple, so they must miss.
//
// v6 trims default-valued tails off fn-entry ArgsText (isNoop `false`,
// empty dep arrays, the `u` createRTFn placeholder, the alwaysThrow site
// hint) — see typefns.trimArgsTail. v5 payloads with the explicit tails
// would still REGISTER correctly, but emitted bytes would then depend on
// cache temperature, breaking dump determinism — so they must miss.
//
// v7 is the IIFE→context-function reshaping: statement blocks in expression
// position hoist into `const ctxFn<N> = function(…){…}` prologue lines
// (created once per materialization) instead of per-call IIFEs — see
// Walker.createFnInContext. v6 payloads bake the old `(function(){…})()`
// bodies; functionally equivalent at runtime, but emitted bytes would
// depend on cache temperature (the v6 criterion), so they must miss.
//
// v8 simplifies the JSON composite prologue: primitives bind via a direct
// `utl.getRT(key).fn` read instead of the guarded resolver IIFE with an
// inline identity/stringify fallback (noop primitives register with the
// family noop fn pre-set runtime-side, so the fallback was dead weight).
// v7 composite payloads bake the old resolver text — must miss for dump
// determinism.
//
// v9 is the noop-elision generation: entries persist an IsNoop bit, the
// walker's dispatch gate composes around external children whose family
// predicate proves them identity (no dep call, no import), and JSON
// composites drop bindings to noop primitives (`return JSON.parse(s)`
// instead of `return rjFn(JSON.parse(s))`). v8 payloads bake the old
// dep-call bodies AND lack the IsNoop bit composites key elision on —
// must miss.
//
// v10 moves diagnostic wording into the Go binary: alwaysThrow entries now
// persist the fully rendered runtime throw message in a single tuple slot
// (was a bare diag code + optional site hint resolved JS-side), so v9
// alwaysThrow payloads carry the wrong slot shape — must miss.
//
// v11 extends noop elision to the entries themselves: a JSON composite whose
// primitive bindings ALL elided (and whose root needs no JSON envelope) now
// emits the noop SHORT-FORM tuple instead of a full `return JSON.stringify(v)`
// / `return JSON.parse(s)` body, and stringifyJson roots that delegate
// straight to native JSON (`return JSON.stringify(v)`) flag isNoop like
// tb/fb's `return Ser`/`return ret` byte-matches. v10 payloads bake the old
// full bodies (composites) and isNoop=false verdicts (sj — which jeDI keys
// its binding elision on), so emitted bytes and liveness would depend on
// cache temperature — must miss.
//
// v12 makes the noop verdict predicate-decided: every family implements
// IsNoopType over the type graph and renderEntryWithDeps takes the verdict
// from it (the compiled body's shape survives only as a protective
// tripwire). Verdicts can differ from v11's Finalize-shape decisions in
// conservative corners, so v11 payloads' IsNoop bits and short/full forms
// must miss rather than serve cache-temperature-dependent bytes.
//
// v13 adds the class-name fallback key to the class-serializer lookup:
// class arms now emit `utl.getClassSerializer('<id>', '<className>')` so a
// single registration covers every generic instantiation of the class. v12
// payloads bake the old single-arg lookup — functionally they'd still hit
// on the exact id, but the name fallback would silently not apply and
// emitted bytes would depend on cache temperature — must miss.
//
// v14 drops constants.Version from the fnHash salt (operations/fnhash.go): the
// per-family fnHash prefix baked into every cached ArgsText's key slot changes
// one final time, WITHOUT the version-folded typeID directory moving. Across
// released versions the typeID dir already segregates caches, but a same-version
// rebuild (dev / test / a mid-version binary swap) would otherwise read a v13
// entry whose ArgsText key slot carries the OLD fnHash prefix while the resolver
// keys the entry by the NEW one — a silent runtime miss. Same failure mode as
// the v2→v3 fnHash naming flip: v13 payloads bake the old keys, so they must
// miss. (The disk-cache FINGERPRINT is unchanged — the version was never in it,
// by design; this is a payload-shape bump, which is what FormatVersion guards.)
//
// v15 adds PureFnRefs so a cache hit reconstructs the entry's pure-fn edges. The
// built-in pure-fn bodies (`rt::…` / `rtFormats::…`) are now delivered on demand
// through the module graph (a SoftDep + the tuple deps thunk) instead of a
// blanket side-effect import, and those edges ride each fn entry's PureFnRefs.
// Without persisting them a warm entry would rebuild empty SoftDeps and drop its
// pure-fn imports — a runtime `getPureFn(...) === undefined`. Unlike ChildRefs /
// CrossFamilyRefs the keys are stable `<ns>::<fn>` strings (not structural-id
// derived), so no drift check is needed; v14 payloads simply lack the field and
// must miss so the walk re-derives it. ArgsText is unchanged.
// v16 persists each entry's build-time DIAGNOSTICS. The walker is what emits
// them, and a cache hit skips the walker — so from the second build onward a
// project's warnings silently vanished, and came back only after a cache wipe.
// Only the code + args are stored: the SITE is deliberately not, because
// provenance is a property of the current build's call sites, not of the cached
// type. A hit re-emits each finding against the live provenance. v15 payloads
// carry no diagnostics and must miss so the walk re-derives them.
const FormatVersion = 16

// CachedDiagnostic is one build-time finding an entry's walk produced, stored
// so a cache hit can re-emit it. Code + args only, matching the wire contract
// where the message text is rendered JS-side from the catalog; the source
// location comes from the CURRENT build's provenance, never from the cache.
type CachedDiagnostic struct {
	Code string   `json:"code"`
	Args []string `json:"args,omitempty"`
}

// ChildRef captures one (structuralID, hash) pair referenced inside a
// cached factory body. Stored alongside the body so the reader can
// re-resolve `hash` against the live dict and bail to a miss if the
// current build's hash for `structuralID` differs (or `structuralID` is
// unknown to the current build at all).
type ChildRef struct {
	StructuralID string `json:"sid"`
	Hash         string `json:"hash"`
}

// CrossFamilyRef captures one cross-family dependency the cached entry's
// body reaches — a namespaced hash with a FOREIGN family prefix (e.g.
// `val_<memberHash>` referenced inside a `tb` / `pj` entry to discriminate
// a union member). Stored decomposed so the reader can both revalidate
// against hash drift (via StructuralID → Hash, exactly like ChildRef) AND
// reconstruct the namespaced dependency on a cache hit (Prefix + the
// current hash). The prefix is stored explicitly rather than assumed to be
// `val_`, so a future cross-family edge into another family round-trips too.
type CrossFamilyRef struct {
	// Prefix is the namespaced family prefix, everything up to and
	// including the first `_` (e.g. "val_").
	Prefix string `json:"prefix"`
	// StructuralID is the referenced member's structural id at write time,
	// used to detect hash drift across builds (same rule as ChildRef).
	StructuralID string `json:"sid"`
	// Hash is the bare member hash (the namespaced dep with Prefix
	// stripped) baked into the body at write time.
	Hash string `json:"hash"`
}

// RTEntry is the on-disk shape persisted per (typeID, fnTag).
type RTEntry struct {
	// Format is the layout version (FormatVersion). Files whose Format
	// disagrees with the current FormatVersion are treated as misses.
	Format int `json:"version"`
	// StructuralID is the typeID's structural id at write time. The
	// reader requires the live cache's structural id for this typeID to
	// equal this value; any mismatch (hash drift / collision extension)
	// is a miss.
	StructuralID string `json:"structuralID"`
	// ArgsText is the raw tuple argument text as rendered — the entry
	// tuple's positional args from the cache key onward (pre-migration this
	// slot held a full `init(…);` statement). No placeholders: hashes are
	// baked in. Reusing the text directly requires every ChildRef to still
	// resolve.
	ArgsText string `json:"argsText"`
	// IsNoop mirrors the rendered entry's noop verdict (the short-form
	// tuple whose fn is the family identity). Persisted so a cache hit
	// reconstructs entrymod.Entry.IsNoop — the JSON composite collector
	// keys primitive-binding elision on it.
	IsNoop bool `json:"isNoop,omitempty"`
	// ChildRefs is one entry per RT-dependency hash baked into ArgsText
	// (the `val_<childHash>` namespaced ids in walker.RTDependencies).
	// Empty for leaf entries with no child RT calls.
	ChildRefs []ChildRef `json:"childRefs"`
	// CrossFamilyRefs is one entry per cross-family edge the body reaches
	// (walker.CrossFamilyDeps — namespaced hashes with a foreign family
	// prefix, e.g. `val_<member>` inside a `tb` / `pj` entry). Persisted so
	// a cache hit reconstructs the same crossFamilyDeps the fresh walk
	// would have produced; without it the demand-collection pass would see
	// an empty set on a hit and miss the val_<member> roots. Empty for
	// entries with no cross-family edges.
	CrossFamilyRefs []CrossFamilyRef `json:"crossFamilyRefs,omitempty"`
	// PureFnRefs is one entry per pure-fn dependency the body reaches
	// (walker.PureFnDependencies rendered as `<ns>::<fn>` keys, e.g.
	// `rt::newRunTypeErr`). Persisted so a cache hit rebuilds the entry's
	// SoftDeps pure-fn edges — the demand-driven built-in delivery imports the
	// pure-fn module off these. The keys are stable strings (no structural-id
	// translation, no drift check). Empty for entries that reach no pure fn.
	PureFnRefs []string `json:"pureFnRefs,omitempty"`
	// Diagnostics is every build-time finding this entry's walk emitted, so a
	// warm build reports the same warnings a cold one does. Re-emitted against
	// the live provenance sites (see the FormatVersion note above). Empty for
	// the overwhelming majority of entries, hence omitempty.
	Diagnostics []CachedDiagnostic `json:"diagnostics,omitempty"`
}
