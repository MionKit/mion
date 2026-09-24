// Package diskcache persists per-(typeID, fnTag) artifacts under
// node_modules/.cache/mion/<optsFingerprint>/<typeID>/<fnTag>.json, so later builds skip the walker for unchanged types.
// The directory name is the short hash (runType.ID) consumers see in the emitted JS and the basename is the cache-module Tag
// (constants.CacheModules[…].Tag). The filename never encodes the version: that is folded into the typeID hash itself
// (internal/cachegen/runtype.Cache.uniqueDict), and <optsFingerprint> isolates the non-version build options (hashLength,
// emitCreateRTFn) for the same reason. Every entry's header records its own structural id plus the (structural id, hash) of every
// child in the cached body; the reader re-resolves them against the live runtype.Cache and treats any mismatch as a miss.
package diskcache

// FormatVersion identifies the on-disk JSON layout. Bump it whenever an older binary's files must be read as misses, which is on
// two counts: a payload this reader would misread, and a payload that still registers but emits DIFFERENT bytes than a cold walk
// (emitted bytes must never depend on cache temperature). The history below is one line per bump, with the reason it forced one.
//
// v2 adds CrossFamilyRefs, so a hit reconstructs the entry's cross-family union edges instead of serving empty crossFamilyDeps.
// v3 is the hashed-naming flip: every Line and CrossFamilyRef.Prefix embeds an opaque fnHash instead of the readable family tag.
// v4 redefines the `clone` JSON encoder around prepareForJsonClone (shape-derived strip), so a v3 `jeCL` body preserves extras.
// v5 is the per-entry virtual-module migration: the payload is the tuple ARGUMENT TEXT, not an `init(…);` statement, deps fully quoted.
// v6 trims default-valued tails off fn-entry ArgsText (typefns.trimArgsTail).
// v7 hoists statement blocks into `const ctxFn<N> = function(…){…}` prologue lines instead of per-call IIFEs (Walker.createFnInContext).
// v8 binds JSON-composite primitives with a direct `utl.getRT(key).fn` read instead of the guarded resolver IIFE.
// v9 is the noop-elision generation: entries persist an IsNoop bit and JSON composites drop bindings to noop primitives.
// v10 persists an alwaysThrow entry's fully rendered runtime throw message in one tuple slot, replacing the JS-side diag code + site.
// v11 extends noop elision to the entries themselves: fully elided composites and native-JSON stringify roots emit the short form.
// v12 makes the noop verdict predicate-decided (every family's IsNoopType over the type graph), which differs from v11 in corners.
// v13 emits `utl.getClassSerializer('<id>', '<className>')`, so one registration covers every generic instantiation of the class.
// v14 drops constants.Version from the fnHash salt (operations/fnhash.go): a same-version rebuild would otherwise read a v13 key slot
// holding the OLD prefix while the resolver keys the entry by the new one. The disk-cache FINGERPRINT never carried the version, by design.
// v15 adds PureFnRefs: without them a warm entry rebuilds empty SoftDeps and drops its pure-fn imports (`getPureFn(...) === undefined`).
// v16 persists each entry's build-time DIAGNOSTICS, which only the walker emits, so warm builds stopped warning. The SITE is deliberately
// not stored: provenance belongs to the current build's call sites, so a hit re-emits each finding against the live ones.
// v17 renames restoreFromJson / restoreFromJsonStrip to restoreFromJsonMutate / restoreFromJsonClone, moving both families' fnHash while
// their tags (rj / rjs) and cache basenames stay put; the header check is structural-id only, so a v16 payload would hit and feed the
// runtime a key nothing registers.
const FormatVersion = 17

// CachedDiagnostic is one build-time finding an entry's walk produced, stored so a cache hit can re-emit it.
// Code + args only: the message text is rendered JS-side from the catalog and the location comes from the CURRENT build.
type CachedDiagnostic struct {
	Code string   `json:"code"`
	Args []string `json:"args,omitempty"`
}

// ChildRef captures one (structuralID, hash) pair referenced inside a cached factory body, so the reader can re-resolve it against
// the live dict and bail to a miss when the hash differs or the structural id is unknown to this build.
type ChildRef struct {
	StructuralID string `json:"sid"`
	Hash         string `json:"hash"`
}

// CrossFamilyRef is a cached body's dep with a FOREIGN family prefix, such as `val_<memberHash>` in a `pj` union.
// Stored decomposed so a hit revalidates hash drift and rebuilds the dep; the explicit prefix lets any family round-trip.
type CrossFamilyRef struct {
	// Prefix is the namespaced family prefix: everything up to and including the first `_` (e.g. "val_").
	Prefix string `json:"prefix"`
	// StructuralID is the referenced member's structural id at write time, for detecting hash drift (same rule as ChildRef).
	StructuralID string `json:"sid"`
	// Hash is the bare member hash, the namespaced dep with Prefix stripped, as baked into the body at write time.
	Hash string `json:"hash"`
}

// RTEntry is the on-disk shape persisted per (typeID, fnTag).
// Trust: the reader checks identity and freshness, never the integrity of ArgsText, and a digest would not change that, since whoever
// can write a cache file can write its digest too. The code it feeds runs through `new Function` at startup, so the cache is only as
// trusted as the node_modules it lives under: keep it out of any location an untrusted process can write.
type RTEntry struct {
	// Format is the layout version; a file disagreeing with the current FormatVersion is a miss.
	Format int `json:"version"`
	// StructuralID is the typeID's structural id at write time; a live cache disagreeing (hash drift, collision extension) is a miss.
	StructuralID string `json:"structuralID"`
	// ArgsText is the entry tuple's positional args from the cache key onward, as rendered.
	// No placeholders: the hashes are baked in, so reusing the text requires every ChildRef to still resolve.
	ArgsText string `json:"argsText"`
	// IsNoop mirrors the rendered entry's noop verdict; the JSON composite collector keys its primitive-binding elision on it.
	IsNoop bool `json:"isNoop,omitempty"`
	// ChildRefs is one entry per RT-dependency hash baked into ArgsText (walker.RTDependencies); empty for leaf entries.
	ChildRefs []ChildRef `json:"childRefs"`
	// CrossFamilyRefs is one entry per cross-family edge the body reaches (walker.CrossFamilyDeps), so a hit rebuilds the crossFamilyDeps
	// a fresh walk would produce; without it the demand-collection pass sees an empty set and misses the val_<member> roots.
	CrossFamilyRefs []CrossFamilyRef `json:"crossFamilyRefs,omitempty"`
	// PureFnRefs is one entry per pure-fn dependency the body reaches (walker.PureFnDependencies), so a hit rebuilds the entry's SoftDeps
	// pure-fn edges, which the demand-driven built-in delivery imports the module off.
	// Drift-checked against purefnids.Has, not a structural id: an id IS the hash of the body, so a no means the baked
	// `utl.getPureFn('<id>')` points at nothing.
	PureFnRefs []string `json:"pureFnRefs,omitempty"`
	// Diagnostics is every build-time finding this entry's walk emitted, re-emitted against the live provenance sites,
	// so a warm build reports the same warnings a cold one does.
	Diagnostics []CachedDiagnostic `json:"diagnostics,omitempty"`
}
