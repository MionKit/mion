// Serializer: projects tsgo's *checker.Type into a reflection-shape
// reflection.RunType graph. Every resolved type gets a structural id
// (mirroring the reference `_createTypeId`) which is hashed (the reference
// quickHash, ported in `internal/cachegen/hashid`) into a short alphanumeric wire id.
// Two structurally-equal types share the same wire id — that's what makes
// our cache keys stable across builds and equivalent to what the reference
// implementation would compute at runtime.
//
// The Cache is stateful across calls: multiple resolver queries share
// one deduplicated type table and one hash dictionary. NOT safe for
// concurrent use.
//
// Projection is rooted ONLY at types passed to AssignID — which the
// resolver invokes exclusively for marker call arguments
// (see the BOUNDED-SCOPE INVARIANT block in internal/compiler/resolver/scan.go).
// Children are walked transitively from those roots; the serializer
// never reaches into the source file's top-level declarations on its
// own initiative.
package runtype

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/ts-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/reflection"
)

// Options configures the serializer's hash budget. Zero value uses the
// hashid default (7 chars). Larger values reduce collision probability
// in big codebases at the cost of source-code size.
type Options struct {
	HashLength int
}

func (opts Options) hashLength() int {
	if opts.HashLength > 0 {
		return opts.HashLength
	}
	return hashid.DefaultLength
}

// Cache holds the interned type table.
type Cache struct {
	opts Options

	// Pointer cache: same *checker.Type seen twice → same wire id, no re-walk.
	byPtr map[*checker.Type]string

	// Structural cache: same structural id (regardless of pointer identity) →
	// same wire id. This is where structural dedup happens.
	byStructural map[string]string

	// Reverse of byStructural: wire id → structural id. Exposed via
	// StructuralForHash so the on-disk RT cache can verify a cached
	// entry's child refs across builds — given a hash baked into a
	// cached factory body, the disk layer recovers the structural id
	// and re-resolves it against the current dict to detect drift.
	byID map[string]string

	// Type table keyed by wire id. nodes[id] is the canonical entry.
	nodes map[string]*reflection.RunType

	// Insertion order so Dump() returns nodes deterministically (sorted by id
	// at dump time for cross-build determinism).
	insertOrder []string

	// fileTypeIDs records which wire ids were transitively reached from each
	// scanned file's call sites. Populated by the resolver (not by assignID
	// itself, so the cache stays resolution-agnostic). Cleared on Clear and
	// on Rebind — both wipe the per-file scope along with the type table /
	// pointer cache, matching the contract that reset / setSources start
	// "scanned files" from empty.
	fileTypeIDs map[string]map[string]struct{}

	// declFiles records, per wire id, the source files that DECLARE that type —
	// the raw material for a host's type-dependency declaration. Local per node;
	// transitivity comes from fileTypeIDs above. See declfiles.go.
	declFiles map[string][]string

	dict        *hashid.Dict
	typeChecker *checker.Checker
	idComputer  *typeid.Computer
	// fs is the program's (possibly overlay/virtual) filesystem, used by the
	// marker package-name gate (dataOnlyTypeName → the configured package set) so
	// `DataOnly<T>` declared in an overlay/in-memory ts-runtypes package is
	// recognised. nil falls back to os.ReadFile. Kept in sync by the resolver.
	markerOpts marker.Options

	// foreignComputers memoizes one structural-id computer per non-bound
	// checker handed to AssignIDUnder. Each pool checker materializes its
	// own *checker.Type universe, so each needs its own pointer-keyed
	// Computer memo. Like byPtr, the keys are checker-state pointers —
	// Clear and Rebind drop the whole map.
	foreignComputers map[*checker.Checker]*typeid.Computer

	// inProgress tracks wire ids whose projectType call is currently on the
	// stack. A back-edge to an in-progress id (reached via byPtr or
	// byStructural) means that node appears inside its own subtree — i.e. it
	// is circular.
	inProgress map[string]bool

	// circularIDs records ids detected as circular during projection. The
	// flag is applied to the canonical node after projectType returns (the
	// reserved placeholder created in assignID is overwritten, so IsCircular
	// must be set on the final node, not the placeholder).
	circularIDs map[string]bool

	// depthExceeded latches when the active id computer hit its recursion depth
	// cap (typeid.maxWalkDepth) during a walk — a self-instantiating or genuinely
	// unbounded type that would otherwise overflow the Go stack. assignID sets it
	// and returns a benign placeholder instead of committing a truncated node; the
	// resolver's per-site commit resets it and raises MKR009/MKR008 when set.
	depthExceeded bool
	// depthCulprit carries the walker's classified cause alongside the latch:
	// the self-instantiating generic's name (→ MKR009), or "" (→ MKR008).
	depthCulprit string
	// sampleConflicts latches cross-site mock-sample disagreements found at the
	// dedup point. Samples are NOT id-relevant (they are generation metadata, not
	// validation behaviour), so two sites differing only in their declared pools
	// share ONE entry — the intended win. The residue this catches: when both
	// sites DECLARE a pool and the pools differ, the shared entry mocks from
	// whichever interned first, so adding or reordering unrelated code can change
	// which pool wins. Latched here, raised by the resolver, which owns the sites.
	sampleConflicts []SampleConflict

	// overrides is the `overrideX<T>(pureFn)` table built by the resolver's
	// early override-collection pass, keyed by a node's BASE structural key →
	// family op key → cfn body hash. Threaded into every id computer (bound +
	// foreign) so structural ids fold the override suffix, and read in assignID
	// to stamp RunType.Overrides onto the projected node. Nil until SetOverrides
	// runs (which MUST precede any AssignID — the id caches must not hold
	// pre-fold ids).
	overrides map[string]map[string]string
}

// NewCache constructs an empty Cache bound to the supplied checker.
func NewCache(typeChecker *checker.Checker, opts Options) *Cache {
	return &Cache{
		opts:         opts,
		byPtr:        make(map[*checker.Type]string),
		byStructural: make(map[string]string),
		byID:         make(map[string]string),
		nodes:        make(map[string]*reflection.RunType),
		fileTypeIDs:  make(map[string]map[string]struct{}),
		declFiles:    make(map[string][]string),
		dict:         hashid.New(),
		typeChecker:  typeChecker,
		idComputer:   typeid.New(typeChecker),
		inProgress:   make(map[string]bool),
		circularIDs:  make(map[string]bool),
	}
}

// SetMarkerOptions records the marker detection options — the accepted marker
// package set plus the program's filesystem — for the package-name gate.
// The resolver calls this on cache creation and on every program swap so the
// gate reads package.json from the current overlay. Safe to pass nil (os disk).
func (cache *Cache) SetMarkerOptions(markerOpts marker.Options) { cache.markerOpts = markerOpts }

// Size returns the number of distinct types currently interned.
func (cache *Cache) Size() int { return len(cache.nodes) }

// putNode finalizes a canonical entry: stamps the derived Family /
// NotSupported fields once (entries are immutable after intern, so the
// old per-Dump re-stamp was pure recompute) and registers the node in
// the type table + insertion order.
func (cache *Cache) putNode(id string, node *reflection.RunType) {
	reflection.PopulateFamily(node)
	cache.nodes[id] = node
	cache.insertOrder = append(cache.insertOrder, id)
}

// NodesView returns the live id→node table for read-only ref resolution
// (the typefns walkers' RefTable). Callers MUST NOT mutate the map or
// the nodes — the cache keeps ownership and keeps inserting on later
// scans. Family/NotSupported are stamped at intern time (putNode), so
// entries are render-ready without a per-dispatch PopulateFamily pass.
func (cache *Cache) NodesView() map[string]*reflection.RunType { return cache.nodes }

// Clear drops every interned type and resets the hash dictionary. Used by
// the resolver when a `resetCache` op arrives, or implicitly when a fresh
// session is established. Safe to call concurrently with… nothing — the
// cache is not thread-safe (same constraint as the package as a whole).
func (cache *Cache) Clear() {
	cache.byPtr = make(map[*checker.Type]string)
	cache.byStructural = make(map[string]string)
	cache.byID = make(map[string]string)
	cache.nodes = make(map[string]*reflection.RunType)
	cache.insertOrder = cache.insertOrder[:0]
	cache.fileTypeIDs = make(map[string]map[string]struct{})
	cache.declFiles = make(map[string][]string)
	cache.dict = hashid.New()
	cache.foreignComputers = nil
	cache.inProgress = make(map[string]bool)
	cache.circularIDs = make(map[string]bool)
	cache.overrides = nil
	if cache.typeChecker != nil {
		cache.idComputer = typeid.New(cache.typeChecker)
	}
}

// SetOverrides installs the `overrideX<T>(pureFn)` table (built by the
// resolver's early override-collection pass) so every subsequent structural-id
// computation folds the `|cfn:…` suffix and every projected node is stamped
// with RunType.Overrides. MUST be called before any AssignID for the session:
// it recreates the id computers (whose caches must not already hold pre-fold
// ids). A nil/empty table is a no-op fold (the plain id path).
func (cache *Cache) SetOverrides(overrides map[string]map[string]string) {
	cache.overrides = overrides
	if cache.typeChecker != nil {
		cache.idComputer = typeid.NewWithOverrides(cache.typeChecker, overrides)
	}
	cache.foreignComputers = nil
}

// Rebind points the cache at a new checker. Called after a Program swap so
// subsequent assignID calls compute structural ids against the live checker.
// The pointer cache (byPtr) is cleared because keys are *checker.Type from
// the old Program and can never match new lookups; structural dedup
// (byStructural + nodes) survives — same shape, same id across Programs.
//
// Passing nil unbinds — the cache becomes safe-to-hold but unusable until a
// subsequent Rebind installs a real checker. Used by resolver.ResetCache
// when wiping the Program back to the NewServer state.
func (cache *Cache) Rebind(typeChecker *checker.Checker) {
	cache.typeChecker = typeChecker
	if typeChecker != nil {
		cache.idComputer = typeid.NewWithOverrides(typeChecker, cache.overrides)
	} else {
		cache.idComputer = nil
	}
	// Foreign computers hold pointers into the previous Program's checker
	// state — dead after a swap, same rationale as byPtr below.
	cache.foreignComputers = nil
	cache.byPtr = make(map[*checker.Type]string)
	// Per-file scope is tied to the previous Program's source files; a
	// Program swap invalidates every key. Drop the map so the next
	// scanFiles starts from "no files scanned yet".
	cache.fileTypeIDs = make(map[string]map[string]struct{})
	cache.declFiles = make(map[string][]string)
}

// Dump returns every interned Type sorted by wire id (deterministic across
// builds — given identical inputs, dump bytes are identical).
func (cache *Cache) Dump() []*reflection.RunType {
	ids := make([]string, 0, len(cache.nodes))
	for id := range cache.nodes {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	out := make([]*reflection.RunType, 0, len(ids))
	for _, id := range ids {
		out = append(out, cache.nodes[id])
	}
	return out
}

// Added returns the slice of nodes inserted since `before`. Used by the
// resolver to stream incremental updates back to clients.
func (cache *Cache) Added(before int) []*reflection.RunType {
	if before >= len(cache.insertOrder) {
		return nil
	}
	out := make([]*reflection.RunType, 0, len(cache.insertOrder)-before)
	for _, id := range cache.insertOrder[before:] {
		if node, ok := cache.nodes[id]; ok {
			out = append(out, node)
		}
	}
	return out
}

// Serialize projects tsType into the cache and returns a ref to the canonical
// entry. Callers receive a `KindRef` sentinel; the actual full Type lives in
// `cache.nodes[id]`.
func (cache *Cache) Serialize(tsType *checker.Type) *reflection.RunType {
	id := cache.assignID(tsType)
	return reflection.NewRef(id)
}

// serializeOptionalChild projects an optional member's child (property / tuple
// slot / parameter) with the redundant `undefined` stripped — see
// typeid.ResolveOptionalChild. Kept in lockstep with the id computer's
// optionalChildID so the structural id and the projected node agree on the
// child's shape (the recursion-safety contract).
func (cache *Cache) serializeOptionalChild(childType *checker.Type) *reflection.RunType {
	child := typeid.ResolveOptionalChild(cache.typeChecker, childType)
	if child.Members == nil {
		return cache.Serialize(child.Type)
	}
	return cache.serializeSyntheticUnion(child.Members)
}

// serializeSyntheticUnion projects a union built from an explicit member list —
// used for an optional child that keeps `null` after `undefined` is stripped
// (e.g. `x?: string | null`). The structural id matches
// typeid.SyntheticUnionStructural so it dedups against an equivalent real union.
func (cache *Cache) serializeSyntheticUnion(members []*checker.Type) *reflection.RunType {
	structural := typeid.SyntheticUnionStructural(cache.idComputer, members)
	if id, ok := cache.byStructural[structural]; ok {
		return reflection.NewRef(id)
	}
	id, err := cache.uniqueDict(structural, cache.opts.hashLength())
	if err != nil {
		id = "x_" + hashid.QuickHash(structural, cache.opts.hashLength(), "")
	}
	cache.intern(structural, id)
	node := &reflection.RunType{ID: id, Kind: reflection.KindUnion}
	// Reserve the slot before projecting members so a member that cycles back sees
	// the id.
	cache.putNode(id, node)
	for _, member := range members {
		node.Children = append(node.Children, cache.Serialize(member))
	}
	cache.finalizeUnion(node)
	// Re-stamp Family/NotSupported now that the children are populated (the reserve
	// above stamped a childless node).
	reflection.PopulateFamily(node)
	cache.nodes[id] = node
	return reflection.NewRef(id)
}

// DepthExceeded reports whether the most recent walk hit the structural-id
// recursion depth cap (typeid.maxWalkDepth) — the resolver's per-site commit
// reads this to raise MKR009/MKR008. Reset via ResetDepthExceeded.
func (cache *Cache) DepthExceeded() bool { return cache.depthExceeded }

// ResetDepthExceeded clears the depth-cap latch before a fresh top-level walk.
func (cache *Cache) ResetDepthExceeded() {
	cache.depthExceeded = false
	cache.depthCulprit = ""
	cache.sampleConflicts = nil
}

// DepthCulprit returns the walker's classified cause for the latched cap: the
// self-instantiating generic's name, or "" for plain too-deep nesting.
func (cache *Cache) DepthCulprit() string { return cache.depthCulprit }

// SampleConflict is one cross-site disagreement: an entry two sites share, each
// having DECLARED a different mock-sample pool for it.
type SampleConflict struct {
	// ID is the shared cache entry both sites resolved to.
	ID string
	// Format names the format whose pool disagrees (`stringFormat`, `email`, …).
	Format string
	// Kept is the pool already interned — today's winner, purely by having been
	// seen first. Incoming is the pool the second site declared.
	Kept     []string
	Incoming []string
}

// SampleConflicts returns the disagreements latched since the last reset.
func (cache *Cache) SampleConflicts() []SampleConflict { return cache.sampleConflicts }

// AssignID projects tsType into the cache (if new) and returns its hash id.
// Public alias for the internal assignID used by callers — like the marker
// scanner — that only need an id, not a RunType sentinel.
func (cache *Cache) AssignID(tsType *checker.Type) string {
	return cache.assignID(tsType)
}

// AssignIDUnder projects tsType under the checker that materialized it and
// returns its hash id. Pool checkers each own a private *checker.Type
// universe — types from different checkers must never mix (upstream
// contract on Program.GetTypeCheckerForFile) — so a type resolved by a
// non-bound checker has to be walked with THAT checker. The structural-id
// layer is checker-independent (typeid sorts members / union ids), so
// equivalent types projected under different checkers still dedup to one
// wire id via byStructural; byPtr keys can't collide across checkers
// (distinct allocations).
//
// Implementation: temporarily swaps the cache's bound checker + id
// computer for the duration of the (recursive) projection. Serial-only —
// the cache stays unsafe for concurrent use; the parallel scan calls this
// from its single-goroutine commit phase.
func (cache *Cache) AssignIDUnder(typeChecker *checker.Checker, tsType *checker.Type) string {
	if typeChecker == nil || typeChecker == cache.typeChecker {
		return cache.assignID(tsType)
	}
	previousChecker, previousComputer := cache.typeChecker, cache.idComputer
	cache.typeChecker = typeChecker
	cache.idComputer = cache.computerFor(typeChecker)
	defer func() {
		cache.typeChecker = previousChecker
		cache.idComputer = previousComputer
	}()
	return cache.assignID(tsType)
}

// computerFor returns the memoized structural-id computer for a non-bound
// checker, creating it on first use.
func (cache *Cache) computerFor(typeChecker *checker.Checker) *typeid.Computer {
	if cache.foreignComputers == nil {
		cache.foreignComputers = map[*checker.Checker]*typeid.Computer{}
	}
	computer, ok := cache.foreignComputers[typeChecker]
	if !ok {
		computer = typeid.NewWithOverrides(typeChecker, cache.overrides)
		cache.foreignComputers[typeChecker] = computer
	}
	return computer
}

// SerializeAtomicKind registers (or reuses) a synthetic canonical
// RunType entry for an atomic ReflectionKind without going through
// the type checker. Used by the `noLiterals` resolver path to
// redirect a unique-symbol literal type to the canonical `symbol`
// kind — tsgo's `getBaseTypeOfLiteralType` doesn't handle
// TypeFlagsUniqueESSymbol, so the resolver does the swap explicitly
// after detecting the unhandled case (see internal/compiler/resolver/scan.go).
//
// Two calls with the same kind deduplicate via the structural map.
// Today only `KindSymbol` is needed; if other atomic kinds ever
// require the same escape hatch, the switch grows in lockstep with
// the RT emit switch in internal/cachegen/typefunctions/istype.go.
func (cache *Cache) SerializeAtomicKind(kind reflection.ReflectionKind) string {
	structural := strconv.Itoa(int(kind)) + ":atomic"
	if id, ok := cache.byStructural[structural]; ok {
		return id
	}
	id, err := cache.uniqueDict(structural, cache.opts.hashLength())
	if err != nil {
		id = "x_at_" + hashid.QuickHash(structural, cache.opts.hashLength(), "")
	}
	cache.intern(structural, id)
	cache.putNode(id, &reflection.RunType{ID: id, Kind: kind})
	return id
}

// SerializeTopLevel returns the canonical RunType entry (not a ref). Used by
// the resolver to record the top of a query result so callers see the full
// shape rather than a sentinel.
func (cache *Cache) SerializeTopLevel(tsType *checker.Type) *reflection.RunType {
	id := cache.assignID(tsType)
	return cache.nodes[id]
}

// NodeByID returns the canonical full Type for id, or nil if no such id has
// been interned. Backs the enrichment bridge/closure walkers and the
// demand-scope pass, which follow a member type's child KindRef slots by
// re-looking-up each referenced id.
func (cache *Cache) NodeByID(id string) *reflection.RunType {
	return cache.nodes[id]
}

// RecordFileID associates id with file in the per-file scope map. Called by
// the resolver after each scanFiles run to remember which run types a
// given file's call sites transitively reached. Used later by IDsForUnion
// to project a scanFiles response down to the request's specific files.
func (cache *Cache) RecordFileID(file, id string) {
	if file == "" || id == "" {
		return
	}
	bucket, ok := cache.fileTypeIDs[file]
	if !ok {
		bucket = make(map[string]struct{})
		cache.fileTypeIDs[file] = bucket
	}
	bucket[id] = struct{}{}
}

// IDsForUnion returns the deduplicated, sorted slice of wire ids reachable
// from any of files. The resolver passes the request's explicit Files
// list so the response is scoped to those files only — NOT to every file
// that's ever been scanned in this session. Ids missing from the type
// table are dropped silently (Clear / Rebind keep the two maps in sync).
func (cache *Cache) IDsForUnion(files []string) []string {
	if len(files) == 0 {
		return nil
	}
	seen := make(map[string]struct{})
	for _, file := range files {
		for id := range cache.fileTypeIDs[file] {
			if _, ok := cache.nodes[id]; !ok {
				continue
			}
			seen[id] = struct{}{}
		}
	}
	if len(seen) == 0 {
		return nil
	}
	out := make([]string, 0, len(seen))
	for id := range seen {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// StructuralForHash returns the structural id for an interned wire id, or
// "" when absent. The disk-side RT cache uses this at write time to
// record (structural id, hash) pairs for every child reference baked
// into a cached factory body — at read time it re-resolves each
// structural id against the current dict and treats any drift (id
// missing, or different short hash) as a cache miss.
func (cache *Cache) StructuralForHash(id string) string {
	return cache.byID[id]
}

// HashForStructural returns the wire id for a structural id, or "" if the
// structural id has not been interned in this build. Companion to
// StructuralForHash used at disk-cache read time.
func (cache *Cache) HashForStructural(structural string) string {
	return cache.byStructural[structural]
}

// intern records the (structural ↔ id) pair in both directions. Every
// site that mints a new wire id MUST go through this so byID stays in
// lockstep with byStructural — callers reading byID expect the structural
// id of any interned wire id to be recoverable.
func (cache *Cache) intern(structural, id string) {
	cache.byStructural[structural] = id
	cache.byID[id] = structural
}

// versionSalt prefixes every hash input so the same structural id maps
// to different short hashes across binary versions. Folded into the
// rolling hash via UniqueSalted — never retained per id, so the dict
// stores only the bare structural string (which shares its backing bytes
// with byStructural's copy). Read at call time (not a package var):
// version_test.go swaps constants.Version mid-process to pin the
// embedding behavior. The tiny transient concat happens once per
// dict-miss, i.e. once per new node.
func versionSalt() string { return constants.Version + "|" }

// uniqueDict assigns a short hash for structural via the dict.
func (cache *Cache) uniqueDict(structural string, length int) (string, error) {
	return cache.dict.UniqueSalted(versionSalt(), structural, length)
}

// NodesForIDs returns the canonical *RunType entries for the given ids, in
// the order supplied. Ids missing from the table are skipped. Used by the
// resolver to materialise a "scanned files" scoped slice into a Dump.
func (cache *Cache) NodesForIDs(ids []string) []*reflection.RunType {
	if len(ids) == 0 {
		return nil
	}
	out := make([]*reflection.RunType, 0, len(ids))
	for _, id := range ids {
		if node := cache.nodes[id]; node != nil {
			out = append(out, node)
		}
	}
	return out
}

// assignID computes/looks-up the wire id for tsType, projecting it on first sight.
func (cache *Cache) assignID(tsType *checker.Type) string {
	if tsType == nil {
		return cache.internEmpty(reflection.KindUnknown, "nilType")
	}
	if id, ok := cache.byPtr[tsType]; ok {
		if cache.inProgress[id] {
			cache.circularIDs[id] = true
		}
		return id
	}

	cache.idComputer.ResetDepthExceeded()
	structural := cache.idComputer.Compute(tsType)
	if cache.idComputer.DepthExceeded() {
		// The walk hit typeid.maxWalkDepth — a self-instantiating or genuinely
		// unbounded type. Latch it (+ the classified cause) for the resolver
		// (→ MKR009/MKR008) and DON'T project a truncated node: return the shared
		// benign placeholder. Over-deep types all collapse to it; the build fails
		// on the Error diagnostic anyway.
		cache.depthExceeded = true
		cache.depthCulprit = cache.idComputer.DepthCulprit()
		id := cache.internEmpty(reflection.KindUnknown, "depthExceeded")
		cache.byPtr[tsType] = id
		return id
	}
	if id, ok := cache.byStructural[structural]; ok {
		cache.byPtr[tsType] = id
		if cache.inProgress[id] {
			cache.circularIDs[id] = true
		}
		// The incoming type is NOT projected on this path — that is the point of
		// the hit — so its declared pool would otherwise never be looked at.
		// Reconcile it against the entry's before returning.
		cache.reconcileSamples(id, tsType)
		// Same reasoning for the decl files: two files declaring the same shape
		// collapse to one id, and editing EITHER must invalidate. recordDeclFiles
		// unions, so this adds the incoming file without dropping the first.
		cache.recordDeclFiles(id, tsType)
		return id
	}

	// Hash the structural id.
	id, err := cache.uniqueDict(structural, cache.opts.hashLength())
	if err != nil {
		// Unrecoverable hash exhaustion — fall back to a hash of the
		// structural string. The structural form contains `:` separators,
		// so it can't be used verbatim as a JS const name.
		id = "x_" + hashid.QuickHash(structural, cache.opts.hashLength(), "")
	}

	cache.byPtr[tsType] = id
	cache.intern(structural, id)
	cache.recordDeclFiles(id, tsType)

	// Reserve the slot before projecting so cycles see the id.
	cache.putNode(id, &reflection.RunType{ID: id, Kind: typeid.KindOf(cache.typeChecker, tsType)})

	// Mark this id in-progress so a back-edge during projection (a child that
	// resolves back to this same id) flags it circular. Applied to the final
	// node, since the placeholder above is overwritten on the next line.
	cache.inProgress[id] = true
	node := cache.projectType(tsType, id)
	delete(cache.inProgress, id)
	if cache.circularIDs[id] && node != nil {
		node.IsCircular = true
	}
	if node != nil {
		cache.stampOverrides(node, tsType)
	}
	// Replace the placeholder in place (insertOrder already holds id) and
	// stamp the final node's Family/NotSupported fields.
	reflection.PopulateFamily(node)
	cache.nodes[id] = node
	return id
}

// stampOverrides copies the `overrideX<T>(pureFn)` families targeting tsType
// onto the projected node so the type-fn emitter can substitute a cfn redirect.
// Looked up by the node's BASE structural key (the override map's key); a copy
// is taken so the node never shares the override table's map. No-op when the
// type is not overridden or no override table is installed.
func (cache *Cache) stampOverrides(node *reflection.RunType, tsType *checker.Type) {
	if cache.idComputer == nil || len(cache.overrides) == 0 {
		return
	}
	// The lookup key must be computed on a COLD computer, exactly like the
	// fold pass builds the map's keys (fresh computer, empty stack): the warm
	// hashing computer's cache legitimately holds ROOT-FORM spellings of cycle
	// members (a `Node | null` walked as its own top-level type embeds Node's
	// final id instead of a back-edge token), and a base key composed from
	// those differs from the fold key even though both strings are valid.
	// Cost is gated on an installed override table, so plain sessions pay
	// nothing.
	stamper := typeid.NewWithOverrides(cache.typeChecker, cache.overrides)
	families := stamper.OverridesForBaseKey(stamper.BaseStructuralKey(tsType))
	if len(families) == 0 {
		return
	}
	out := make(map[string]string, len(families))
	for family, hash := range families {
		out[family] = hash
	}
	node.Overrides = out
}

// internEmpty creates a placeholder entry for nil/unknown types so consumers
// always see *something* rather than a dangling ref.
func (cache *Cache) internEmpty(kind reflection.ReflectionKind, markerName string) string {
	structural := "_empty_" + markerName
	if id, ok := cache.byStructural[structural]; ok {
		return id
	}
	id, err := cache.uniqueDict(structural, cache.opts.hashLength())
	if err != nil {
		id = "x_" + markerName
	}
	cache.intern(structural, id)
	cache.putNode(id, &reflection.RunType{ID: id, Kind: kind, Flags: []string{markerName}})
	return id
}

// ---------------------------------------------------------------------------
// projection — fills in a node's structural fields. The id is already set by
// assignID; we only populate kind-specific contents here.
// ---------------------------------------------------------------------------

func (cache *Cache) projectType(tsType *checker.Type, id string) *reflection.RunType {
	node := &reflection.RunType{ID: id}
	flags := tsType.Flags()

	// typeName from a user-declared type alias ("User" in `type User = {...}`).
	// A ts-runtypes/builders object-shape helper alias (ObjectType<C> / … — see
	// isBuilderInternalAlias) is skipped: it's compiler-internal, never a user type
	// name, and its type arguments are the raw builder config, so reflecting them
	// leaks the RunType wrapper into the bundle. Left anonymous, the switch below
	// still projects the modeled object shape from the (merged) properties.
	if alias := checker.Type_alias(tsType); alias != nil && alias.Symbol() != nil && !isBuilderInternalAlias(alias.Symbol(), cache.markerOpts) {
		node.TypeName = alias.Symbol().Name
		if typeArguments := alias.TypeArguments(); len(typeArguments) > 0 {
			node.TypeArguments = make([]*reflection.RunType, 0, len(typeArguments))
			for _, typeArgument := range typeArguments {
				node.TypeArguments = append(node.TypeArguments, cache.Serialize(typeArgument))
			}
		}
	} else if name, ok := dataOnlyTypeName(tsType, cache.markerOpts); ok {
		// DataOnly<T> from ts-runtypes: the conditional + key-filtering
		// mapped type strips the alias chain by the time the result reaches us,
		// so the alias check above misses. Recognise it explicitly so the entry
		// stays external in default inline mode (DefaultIsRTInlined treats
		// TypeName-empty KindObjectLiteral as inlinable — fine for ad-hoc
		// shapes, wrong for a brand-named view of a user-named type).
		node.TypeName = name
	}

	switch {
	case flags&checker.TypeFlagsAny != 0:
		node.Kind = reflection.KindAny

	case flags&checker.TypeFlagsUnknown != 0:
		node.Kind = reflection.KindUnknown

	case flags&checker.TypeFlagsNever != 0:
		node.Kind = reflection.KindNever

	case flags&checker.TypeFlagsVoid != 0:
		node.Kind = reflection.KindVoid

	case flags&checker.TypeFlagsUndefined != 0:
		node.Kind = reflection.KindUndefined

	case flags&checker.TypeFlagsNull != 0:
		node.Kind = reflection.KindNull

	case flags&checker.TypeFlagsStringLiteral != 0:
		node.Kind = reflection.KindLiteral
		node.Literal = tsType.AsLiteralType().Value()

	case flags&checker.TypeFlagsNumberLiteral != 0:
		node.Kind = reflection.KindLiteral
		// A numeric ENUM member (`Color.Red = 0`) is a NumberLiteral whose
		// TypeToString is the member NAME ("Color.Red"), not the value — so the
		// emitted validator would check `=== "Color.Red"` and never match the
		// runtime number. Read the underlying value instead (string members already
		// take the `.Value()` path above; bigint enum members already read `.Value()`
		// below). Plain number literals keep TypeToString, untouched.
		if flags&checker.TypeFlagsEnumLiteral != 0 {
			node.Literal = parseNumberLiteral(fmt.Sprintf("%v", tsType.AsLiteralType().Value()))
		} else {
			node.Literal = parseNumberLiteral(cache.typeChecker.TypeToString(tsType))
		}

	case flags&checker.TypeFlagsBooleanLiteral != 0:
		node.Kind = reflection.KindLiteral
		node.Literal = cache.typeChecker.TypeToString(tsType) == "true"

	case flags&checker.TypeFlagsBigIntLiteral != 0:
		node.Kind = reflection.KindLiteral
		// JSON numbers can't carry arbitrary-precision bigint — emit as a
		// decimal string + flag so the renderer wraps with `BigInt(...)`.
		node.Literal = fmt.Sprintf("%v", tsType.AsLiteralType().Value())
		node.Flags = append(node.Flags, "bigint")

	case flags&checker.TypeFlagsUniqueESSymbol != 0:
		node.Kind = reflection.KindLiteral
		// per the reference semantics: literal-symbol validation compares against the
		// symbol's `.description` at runtime (literal.ts:103), which is the
		// string argument the value was constructed with — `Symbol(<desc>)`.
		// tsgo's symbol.Name is the BINDING identifier (e.g. `sym`), which
		// is not what we need. Read the description from the initializer
		// when the value declaration is `const x = Symbol(<literal>)`.
		// Falls back to the binding name (legacy behavior) for cases we
		// can't statically resolve — those will simply fail validation
		// gracefully rather than panic.
		node.Literal = map[string]any{"symbol": uniqueSymbolDescription(tsType)}
		node.Flags = append(node.Flags, "symbol")

	case flags&checker.TypeFlagsString != 0:
		node.Kind = reflection.KindString

	case flags&checker.TypeFlagsNumber != 0:
		node.Kind = reflection.KindNumber

	case flags&checker.TypeFlagsBoolean != 0:
		node.Kind = reflection.KindBoolean

	case flags&checker.TypeFlagsBigInt != 0:
		node.Kind = reflection.KindBigInt

	case flags&checker.TypeFlagsESSymbol != 0:
		node.Kind = reflection.KindSymbol

	case flags&checker.TypeFlagsEnum != 0 || flags&checker.TypeFlagsEnumLike != 0:
		cache.projectEnum(tsType, node)

	case flags&checker.TypeFlagsEnumLiteral != 0:
		// A reference to a single enum member used as a type. Emit the parent
		// enum and tag with the member name.
		cache.projectEnum(tsType, node)
		if symbol := tsType.Symbol(); symbol != nil {
			node.Flags = append(node.Flags, "enumMember:"+symbol.Name)
		}

	case flags&checker.TypeFlagsTemplateLiteral != 0:
		// Template literal type (`` `api/user/${number}` ``). Project
		// the literal text segments + placeholder kinds onto Literal
		// so the emit can compile to an anchored regex at RT-build
		// time. The reference stores the spans inline on the type — tsgo
		// splits them into `texts` (one more than types) + `types`
		// arrays; we serialize the same separation onto the wire.
		node.Kind = reflection.KindTemplateLiteral
		cache.projectTemplateLiteral(tsType, node)

	case flags&checker.TypeFlagsUnion != 0:
		node.Kind = reflection.KindUnion
		members := tsType.Distributed()
		for _, member := range members {
			node.Children = append(node.Children, cache.Serialize(member))
		}
		// Compute safe order + discriminator marks once at serialize time
		// so every FE consumer reads ready-baked metadata.
		cache.finalizeUnion(node)

	case flags&checker.TypeFlagsIntersection != 0:
		// Intersections are collapsed in Go so consumers never see a raw
		// KindIntersection on the wire. See intersection_collapse.go.
		cache.collapseIntersection(tsType, node)

	case flags&checker.TypeFlagsNonPrimitive != 0:
		// The bare `object` primitive (`const x: object`).
		node.Kind = reflection.KindObject

	case flags&checker.TypeFlagsObject != 0:
		cache.projectObjectType(tsType, node)

	default:
		node.Kind = reflection.KindUnknown
		node.TypeName = cache.typeChecker.TypeToString(tsType)
	}

	return node
}

// projectTemplateLiteral serializes a TS template literal type
// (“ `prefix-${number}` “) onto the Literal field. Mirrors the reference
// approach: store the literal text segments + placeholder spans so
// the RT emit can build an anchored regex.
//
// Wire shape:
//
//	{
//	  templateLiteral: {
//	    texts: ["api/user/", ""],
//	    placeholders: [{kind: 6}, ...]  // simplified TypeSpan
//	  }
//	}
//
// `texts` is always one element longer than `placeholders` per
// tsgo's TemplateLiteralType definition. Each placeholder is a
// minimal object — kind only for atomic spans, kind+literal for
// literal-typed spans (the latter would be a `'a' | 'b'` union as a
// span). v1 supports atomic placeholders (number / string / any /
// infer / literal); other shapes panic so we hear about them.
func (cache *Cache) projectTemplateLiteral(tsType *checker.Type, node *reflection.RunType) {
	tplType := tsType.AsTemplateLiteralType()
	if tplType == nil {
		return
	}
	texts := tplType.Texts()
	types := tplType.Types()
	// Build as []any (not []map[string]any) so the type assertion
	// on the read side — `inner["placeholders"].([]any)` — succeeds.
	// Go's interface-slice assertion checks the slice's concrete
	// type, not its element type, so the more specific
	// `[]map[string]any` would silently fail to match `[]any`.
	placeholders := make([]any, 0, len(types))
	for _, spanType := range types {
		placeholders = append(placeholders, templateSpanWireShape(cache, spanType))
	}
	node.Literal = map[string]any{
		"templateLiteral": map[string]any{
			"texts":        toAnySlice(texts),
			"placeholders": placeholders,
		},
	}
}

// templateSpanWireShape converts a placeholder type to its wire
// representation for the templateLiteral.placeholders array.
// Supported spans match the reference spanToRegex: literal, number, string,
// any, infer. Other kinds get a flag marker so the emit's default
// pattern (`[\s\S]*`) still produces a working regex while the
// missing-arm shows up clearly in the wire data.
func templateSpanWireShape(cache *Cache, spanType *checker.Type) map[string]any {
	if spanType == nil {
		return map[string]any{"kind": int(reflection.KindAny)}
	}
	spanFlags := spanType.Flags()
	switch {
	case spanFlags&checker.TypeFlagsStringLiteral != 0:
		return map[string]any{
			"kind":    int(reflection.KindLiteral),
			"literal": spanType.AsLiteralType().Value(),
		}
	case spanFlags&checker.TypeFlagsNumberLiteral != 0:
		return map[string]any{
			"kind":    int(reflection.KindLiteral),
			"literal": parseNumberLiteral(cache.typeChecker.TypeToString(spanType)),
		}
	case spanFlags&checker.TypeFlagsBooleanLiteral != 0:
		return map[string]any{
			"kind":    int(reflection.KindLiteral),
			"literal": cache.typeChecker.TypeToString(spanType) == "true",
		}
	case spanFlags&checker.TypeFlagsString != 0:
		return map[string]any{"kind": int(reflection.KindString)}
	case spanFlags&checker.TypeFlagsNumber != 0:
		return map[string]any{"kind": int(reflection.KindNumber)}
	case spanFlags&checker.TypeFlagsBigInt != 0:
		return map[string]any{"kind": int(reflection.KindBigInt)}
	case spanFlags&checker.TypeFlagsAny != 0:
		return map[string]any{"kind": int(reflection.KindAny)}
	case spanFlags&checker.TypeFlagsUnknown != 0:
		return map[string]any{"kind": int(reflection.KindUnknown)}
	}
	// Fallback — treat as `string`-shaped span so the regex is still
	// permissive. Unknown spans are rare (Infer outside conditional
	// contexts, etc.) and this keeps the validator open-ended rather
	// than rejecting all inputs.
	return map[string]any{"kind": int(reflection.KindString)}
}

func toAnySlice(strs []string) []any {
	out := make([]any, len(strs))
	for i, s := range strs {
		out[i] = s
	}
	return out
}

// ---------------------------------------------------------------------------
// object-flavoured types: array / tuple / promise / function / class /
// objectLiteral / regexp / Date
// ---------------------------------------------------------------------------

func (cache *Cache) projectObjectType(tsType *checker.Type, node *reflection.RunType) {
	if checker.IsTupleType(tsType) {
		cache.projectTuple(tsType, node, nil)
		return
	}

	// GetTypeArguments only works on TypeReference targets — an array-LIKE
	// mapped hybrid (e.g. a mapped type over `T[] & {brand}`) passes
	// IsArrayLikeType with no reference target and would segfault the
	// checker; gate on the Reference flag (id twin: typeid.objectID).
	if cache.typeChecker.IsArrayLikeType(tsType) && tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		typeArguments := cache.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			node.Kind = reflection.KindArray
			node.Child = cache.Serialize(typeArguments[0])
			return
		}
	}

	// Builtin Temporal types (namespace members) promote to KindClass the
	// same way Date/Map/Set do — projectClass reads the registry for the
	// SubKind + ClassRef. Checked first since they're namespace-qualified.
	if _, ok := typeid.TemporalInfoForType(tsType); ok {
		cache.projectClass(tsType, node)
		return
	}

	if symbol := tsType.Symbol(); symbol != nil {
		if reflection.IsPromiseSymbol(symbol.Name) {
			typeArguments := cache.typeChecker.GetTypeArguments(tsType)
			if len(typeArguments) > 0 {
				node.Kind = reflection.KindPromise
				node.Child = cache.Serialize(typeArguments[0])
				return
			}
		}
		switch symbol.Name {
		case "RegExp":
			node.Kind = reflection.KindRegexp
			node.ClassRef = &reflection.ClassRef{Builtin: "RegExp"}
			return
		case "Date", "Map", "Set":
			// tsgo declares these as interfaces in lib.d.ts (no
			// ObjectFlagsClass), but the reference runtypes treat them as classes
			// (they're dispatched through `initClassRunType`). Promote to
			// KindClass with the builtin marker so the footer wires up
			// `t.classType = globalThis.<Name>`.
			cache.projectClass(tsType, node)
			return
		}
		// Everything that is NOT data, taken whole. The supported natives are
		// dispatched above, so whatever reaches here and is either binary or
		// standard-library declared is not a shape we serialise: promote it to
		// KindClass + SubKindNonSerializable the same way Date/Map/Set are
		// promoted, and never walk its members.
		if _, ok := typeid.NotDataBuiltinOf(cache.typeChecker, tsType); ok {
			cache.projectClass(tsType, node)
			return
		}
	}

	if isClass(tsType) {
		cache.projectClass(tsType, node)
		return
	}

	cache.projectObjectLiteral(tsType, node)
}

// projectTuple projects a tuple type's members. labelOverride (one entry per
// element — the lifted `__rtLabels` sentinel from the value-first object form)
// substitutes the declaration labels so the projected node is byte-identical
// to the type-first labeled tuple sharing its structural id; nil reads the
// LabeledDeclaration labels.
func (cache *Cache) projectTuple(tsType *checker.Type, node *reflection.RunType, labelOverride []string) {
	node.Kind = reflection.KindTuple
	tupleType := tsType.TargetTupleType()
	elementInfos := tupleType.ElementInfos()
	typeArguments := cache.typeChecker.GetTypeArguments(tsType)
	for i, info := range elementInfos {
		var elementType *checker.Type
		if i < len(typeArguments) {
			elementType = typeArguments[i]
		}
		elementFlags := info.TupleElementFlags()
		// In tsgo, optional tuple slots type as `T | undefined`. The reflection
		// shape keeps the optional bit on the TupleMember and the inner type
		// stays `T` — strip undefined when the element is optional.
		position := i
		var elementChild *reflection.RunType
		if elementFlags&checker.ElementFlagsOptional != 0 && elementType != nil {
			elementChild = cache.serializeOptionalChild(elementType)
		} else {
			elementChild = cache.Serialize(elementType)
		}
		member := &reflection.RunType{
			Kind:     reflection.KindTupleMember,
			Child:    elementChild,
			Position: &position,
		}
		if labelDecl := info.LabeledDeclaration(); labelDecl != nil {
			// labelDecl is the labeled Parameter / NamedTupleMember AST node.
			// Its .Text() is undefined on the wrapper kind itself; the label
			// lives on the inner binding name. Mirrors the tsgo checker at
			// internal/checker/relater.go:getTupleElementLabel.
			if nameNode := labelDecl.Name(); nameNode != nil {
				member.Name = nameNode.Text()
			}
		}
		if i < len(labelOverride) {
			member.Name = labelOverride[i]
		}
		if elementFlags&checker.ElementFlagsOptional != 0 {
			member.Optional = true
		}
		if elementFlags&checker.ElementFlagsRest != 0 {
			member.Flags = append(member.Flags, "rest")
		}
		if elementFlags&checker.ElementFlagsVariadic != 0 {
			member.Flags = append(member.Flags, "variadic")
		}
		// Anonymous tuple-member node — generate a unique id from its slot
		// index since two members with same payload at different positions
		// must not dedup.
		structural := fmt.Sprintf("_tm_%s_%d", node.ID, i)
		memberID, err := cache.uniqueDict(structural, cache.opts.hashLength())
		if err != nil {
			memberID = "x_tm_" + structural
		}
		member.ID = memberID
		cache.intern(structural, memberID)
		cache.putNode(memberID, member)
		node.Children = append(node.Children, reflection.NewRef(memberID))
	}
}

func (cache *Cache) projectObjectLiteral(tsType *checker.Type, node *reflection.RunType) {
	callSignatures := cache.typeChecker.GetSignaturesOfType(tsType, checker.SignatureKindCall)
	properties := cache.typeChecker.GetPropertiesOfType(tsType)
	if len(callSignatures) > 0 && len(properties) == 0 {
		node.Kind = reflection.KindFunction
		cache.projectSignatureInto(callSignatures[0], node)
		return
	}
	node.Kind = reflection.KindObjectLiteral
	cache.projectMembersInto(tsType, node, properties, callSignatures, false)
	// If this is a named interface, stamp its name as TypeName and capture
	// extends-clause parent refs. `type X = {…}` aliases get their name from
	// Type_alias (projectType), but interfaces have no alias symbol — and
	// the inlining predicate treats NAMED types as dedupe-worthy externals,
	// so interfaces must carry their name too. TypeName never participates
	// in structural ids (typeid doesn't read it), so two same-shape types
	// still collapse to one id. The TS checker has already merged inherited
	// members into `properties` above; .Extends is for explicit tree walks.
	// Anonymous object literals and `type` aliases have no
	// symbol-flagged-Interface declaration, so both additions skip them.
	if symbol := tsType.Symbol(); symbol != nil && symbol.Flags&ast.SymbolFlagsInterface != 0 {
		if node.TypeName == "" {
			node.TypeName = symbol.Name
		}
		for _, baseType := range safeGetBaseTypes(cache.typeChecker, tsType) {
			node.Extends = append(node.Extends, cache.Serialize(baseType))
		}
	}
}

func (cache *Cache) projectClass(tsType *checker.Type, node *reflection.RunType) {
	node.Kind = reflection.KindClass
	// Builtin Temporal types: stamp the registry SubKind + qualified
	// ClassRef.Builtin ("Temporal.PlainDate" → globalThis.Temporal.PlainDate).
	// Done before the symbol-name switch since the bare name ("PlainDate")
	// alone is ambiguous — TemporalInfoForType gates on the namespace.
	if info, ok := typeid.TemporalInfoForType(tsType); ok {
		node.TypeName = info.Name
		node.SubKind = info.SubKind
		node.ClassRef = &reflection.ClassRef{Builtin: info.Builtin}
		return
	}
	var symbolName string
	if symbol := tsType.Symbol(); symbol != nil {
		symbolName = symbol.Name
		node.TypeName = symbolName
		switch symbolName {
		case "Date":
			node.ClassRef = &reflection.ClassRef{Builtin: symbolName}
			node.SubKind = reflection.SubKindDate
		case "Map":
			node.ClassRef = &reflection.ClassRef{Builtin: symbolName}
			node.SubKind = reflection.SubKindMap
		case "Set":
			node.ClassRef = &reflection.ClassRef{Builtin: symbolName}
			node.SubKind = reflection.SubKindSet
		case "RegExp":
			node.ClassRef = &reflection.ClassRef{Builtin: symbolName}
		default:
			// The BUILTIN name, not symbolName: a type can qualify through its
			// base chain (Node's `Buffer`, a user's `class MyBytes extends
			// Uint8Array`), and the footer emits `classType = globalThis.<this
			// name>`. Emitting the subclass's own name there would resolve to
			// undefined at runtime; the matched base always exists.
			if builtin, ok := typeid.NotDataBuiltinOf(cache.typeChecker, tsType); ok {
				node.ClassRef = &reflection.ClassRef{Builtin: builtin}
				node.SubKind = reflection.SubKindNonSerializable
			} else {
				node.ClassRef = &reflection.ClassRef{Name: symbolName}
			}
		}
	}
	// GetTypeArguments only works on TypeReference targets; calling it on
	// a plain interface (like the lib.d.ts Date interface) panics. Guard
	// with the ObjectFlagsReference flag.
	if tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		if typeArguments := cache.typeChecker.GetTypeArguments(tsType); len(typeArguments) > 0 {
			switch symbolName {
			case "Map":
				cache.appendMapArguments(node, typeArguments)
			case "Set":
				cache.appendSetArguments(node, typeArguments)
			default:
				for _, typeArgument := range typeArguments {
					node.Arguments = append(node.Arguments, cache.Serialize(typeArgument))
				}
			}
		}
	}
	// Builtin classes (Date / Map / Set / RegExp / the non-serializable set)
	// project ATOMICALLY — subKind + classRef (+ the Map/Set element
	// Arguments captured above) fully describe them: every consumer
	// (emitters, mocking, reflection) keys on subKind and never walks lib
	// members. Expanding the lib interface would intern dozens of
	// method/parameter nodes per builtin (Date alone: ~66 nodes, dragging
	// in lib.scripthost's VarDate) whose shape would also vary with the
	// loaded TS libs — dead weight with an unstable structural id.
	// Temporal builtins take the same early exit further up.
	if node.ClassRef != nil && node.ClassRef.Builtin != "" {
		return
	}
	// Populate ExtendsArguments — ES6 single-inheritance, so at most one
	// base type. The TS checker has already merged inherited members into
	// GetPropertiesOfType below; ExtendsArguments lets consumers walk the
	// inheritance tree explicitly when needed. safeGetBaseTypes handles
	// the Reference-instantiation case (e.g. `class B extends A<string>`)
	// where the bare GetBaseTypes call would crash.
	for _, baseType := range safeGetBaseTypes(cache.typeChecker, tsType) {
		node.ExtendsArguments = append(node.ExtendsArguments, cache.Serialize(baseType))
	}
	// Populate Implements by walking the class declaration's
	// HeritageClauses for entries with the implements keyword.
	if symbol := tsType.Symbol(); symbol != nil {
		for _, implementedType := range collectImplementsTypes(cache.typeChecker, symbol) {
			node.Implements = append(node.Implements, cache.Serialize(implementedType))
		}
	}
	properties := cache.typeChecker.GetPropertiesOfType(tsType)
	// Class static members live on the symbol's Exports table, not on the
	// instance type. Append them so static properties / methods reach the
	// same projection path (applyMemberModifiers reads the `static` keyword
	// off each declaration's modifier flags).
	if symbol := tsType.Symbol(); symbol != nil {
		properties = appendStaticMembers(properties, symbol)
	}
	cache.projectMembersInto(tsType, node, properties, nil, true)
}

// appendMapArguments wraps Map<K,V>'s two type arguments as synthetic
// KindParameter members tagged with SubKindMapKey / SubKindMapValue and
// appends them to node.Arguments. Mirrors the reference `nodes/native/map.ts`
// shape so consumers can read the keyed parameter slots the same way on
// either side. Each wrapper gets its own synthetic id (`_pa_<parentId>_<n>`,
// same scheme as `projectSignatureInto`) so it participates in the cache.
func (cache *Cache) appendMapArguments(node *reflection.RunType, typeArguments []*checker.Type) {
	if len(typeArguments) != 2 {
		for _, typeArgument := range typeArguments {
			node.Arguments = append(node.Arguments, cache.Serialize(typeArgument))
		}
		return
	}
	keyName := "key"
	valueName := "value"
	keyParameter := cache.newNativeParameter(node.ID, 0, keyName, reflection.SubKindMapKey, typeArguments[0])
	valueParameter := cache.newNativeParameter(node.ID, 1, valueName, reflection.SubKindMapValue, typeArguments[1])
	node.Arguments = append(node.Arguments, keyParameter, valueParameter)
}

// appendSetArguments wraps Set<T>'s single type argument as a synthetic
// KindParameter tagged with SubKindSetItem and appends it to
// node.Arguments. Symmetric to appendMapArguments.
func (cache *Cache) appendSetArguments(node *reflection.RunType, typeArguments []*checker.Type) {
	if len(typeArguments) != 1 {
		for _, typeArgument := range typeArguments {
			node.Arguments = append(node.Arguments, cache.Serialize(typeArgument))
		}
		return
	}
	itemParameter := cache.newNativeParameter(node.ID, 0, "item", reflection.SubKindSetItem, typeArguments[0])
	node.Arguments = append(node.Arguments, itemParameter)
}

// newNativeParameter builds a synthetic KindParameter wrapper for a Map or
// Set type argument and registers it in the cache under a `_pa_<parent>_<i>`
// id. Returns a ref to the wrapper so the caller can splice it into
// node.Arguments.
func (cache *Cache) newNativeParameter(parentID string, index int, name string, subKind reflection.ReflectionSubKind, childType *checker.Type) *reflection.RunType {
	position := index
	wrapper := &reflection.RunType{
		Kind:     reflection.KindParameter,
		SubKind:  subKind,
		Name:     name,
		Position: &position,
		Child:    cache.Serialize(childType),
	}
	structural := fmt.Sprintf("_pa_%s_%s_%d", parentID, name, index)
	wrapperID, err := cache.uniqueDict(structural, cache.opts.hashLength())
	if err != nil {
		wrapperID = "x_pa_" + structural
	}
	wrapper.ID = wrapperID
	cache.intern(structural, wrapperID)
	cache.putNode(wrapperID, wrapper)
	return reflection.NewRef(wrapperID)
}

// appendStaticMembers extends instanceProps with each static member symbol
// the class symbol carries in Exports. Skips internal names (constructor,
// prototype slot, etc.) which start with the InternalSymbolNamePrefix
// sentinel.
func appendStaticMembers(instanceProps []*ast.Symbol, classSymbol *ast.Symbol) []*ast.Symbol {
	if classSymbol.Exports == nil {
		return instanceProps
	}
	for name, exportSymbol := range classSymbol.Exports {
		if exportSymbol == nil {
			continue
		}
		if len(name) > 0 && name[0] == 0xFE {
			// InternalSymbolNamePrefix — skip @@call / @@constructor / @@new / etc.
			continue
		}
		// Filter to value-shape members (property / method / accessor).
		if exportSymbol.Flags&(ast.SymbolFlagsProperty|ast.SymbolFlagsMethod|ast.SymbolFlagsAccessor) == 0 {
			continue
		}
		instanceProps = append(instanceProps, exportSymbol)
	}
	return instanceProps
}

func (cache *Cache) projectMembersInto(
	tsType *checker.Type,
	node *reflection.RunType,
	properties []*ast.Symbol,
	callSignatures []*checker.Signature,
	asClass bool,
) {
	for i, propertySymbol := range properties {
		// Skip TypeScript-synthesized members that aren't part of
		// the user's declared shape:
		//   - `prototype`: the class constructor's prototype
		//     reference. Shows up on class types via the constructor
		//     symbol and produces self-recursive child entries.
		//     The reference `getRTChildren` filters it the same way.
		// Apply only on class projections — interfaces / object
		// literals can legally have a property literally named
		// "prototype" (rare but possible).
		if asClass && propertySymbol != nil && propertySymbol.Name == "prototype" {
			continue
		}
		// The format / slot sentinels are never real properties: when an
		// object ∧ `{__rtFormatName?: …}` intersection
		// routes through the merged property walk, the collapse has already
		// lifted them onto node.FormatAnnotation / the check slots —
		// projecting the props too would surface them on the wire shape.
		// Twin of the typeid.memberIDs skip.
		if propertySymbol != nil &&
			(typeid.IsFormatSentinelPropName(propertySymbol.Name) ||
				typeid.IsContainsSentinelPropName(propertySymbol.Name) || typeid.IsLabelsSentinelPropName(propertySymbol.Name)) {
			continue
		}
		// Members inherited from a default-lib global type (Error's
		// name/message/stack, …) are NOT excluded — they are projected as
		// NON-ENUMERABLE-GUARDED members (appendProperty → applyMemberModifiers
		// sets NonEnumerable via typeid.IsNonEnumerable). Emitters gate the
		// by-name write on a runtime enumerability check, so a vanilla error
		// instance skips them (native `JSON.stringify` behavior — no stack
		// leak) while a value that makes one enumerable serializes it.
		cache.appendProperty(node, propertySymbol, asClass, i)
	}
	for i, indexInfo := range cache.typeChecker.GetIndexInfosOfType(tsType) {
		indexNode := &reflection.RunType{
			Kind:  reflection.KindIndexSignature,
			Index: cache.Serialize(indexInfo.KeyType()),
			Child: cache.Serialize(indexInfo.ValueType()),
		}
		if indexInfo.IsReadonly() {
			indexNode.Readonly = true
		}
		structural := fmt.Sprintf("_idx_%s_%d", node.ID, i)
		indexID, err := cache.uniqueDict(structural, cache.opts.hashLength())
		if err != nil {
			indexID = "x_idx_" + structural
		}
		indexNode.ID = indexID
		cache.intern(structural, indexID)
		cache.putNode(indexID, indexNode)
		node.Children = append(node.Children, reflection.NewRef(indexID))
	}
	for i, signature := range callSignatures {
		callNode := &reflection.RunType{Kind: reflection.KindCallSignature}
		// Id BEFORE projecting: parameter nodes intern under the owning
		// node's id (see appendProperty — an empty id collides them all).
		structural := fmt.Sprintf("_cs_%s_%d", node.ID, i)
		callID, err := cache.uniqueDict(structural, cache.opts.hashLength())
		if err != nil {
			callID = "x_cs_" + structural
		}
		callNode.ID = callID
		cache.projectSignatureInto(signature, callNode)
		cache.intern(structural, callID)
		cache.putNode(callID, callNode)
		node.Children = append(node.Children, reflection.NewRef(callID))
	}
}

func (cache *Cache) appendProperty(parent *reflection.RunType, symbol *ast.Symbol, asClass bool, index int) {
	propertyType := cache.typeChecker.GetTypeOfSymbol(symbol)

	// Method-vs-property: a property whose type is a single-call-signature
	// function with no other members maps to the `method` / `methodSignature`
	// form.
	isMethod := false
	if propertyType != nil {
		signatures := cache.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(cache.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			isMethod = true
		}
	}

	memberName := stableMemberName(symbol.Name)
	member := &reflection.RunType{Name: memberName}
	// A non-enumerable-guarded member (lib-global-inherited or `@nonEnumerable`)
	// is projected as OPTIONAL — the wire may omit it — so validators and the
	// presence path accept its absence. Mirrors typeid.memberID
	// (optional = declared || guarded); both read the SAME symbol via the shared
	// typeid.IsNonEnumerable, so id and projection can't drift. NonEnumerable
	// additionally tells the emitters to gate the write on enumerability.
	guarded := typeid.IsNonEnumerable(symbol)
	if symbol.Flags&ast.SymbolFlagsOptional != 0 || guarded {
		member.Optional = true
	}
	member.NonEnumerable = guarded
	member.IsSafeName = isSafeName(memberName)
	applyMemberModifiers(member, symbol, asClass)

	// The member id must exist BEFORE a signature projects into it: parameter
	// nodes intern under `_pa_<member id>_<name>_<i>`, so an empty id would
	// collide every same-named parameter of every method member onto one
	// interned node (the last projection overwriting the rest).
	structural := fmt.Sprintf("_pr_%s_%s_%d", parent.ID, memberName, index)
	memberID, err := cache.uniqueDict(structural, cache.opts.hashLength())
	if err != nil {
		memberID = "x_pr_" + structural
	}
	member.ID = memberID

	if isMethod {
		if asClass {
			member.Kind = reflection.KindMethod
		} else {
			member.Kind = reflection.KindMethodSignature
		}
		signatures := cache.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		cache.projectSignatureInto(signatures[0], member)
	} else {
		if asClass {
			member.Kind = reflection.KindProperty
		} else {
			member.Kind = reflection.KindPropertySignature
		}
		// Optional properties carry `T | undefined` at the symbol type
		// layer; the Optional flag IS the "undefined-permitted" signal so
		// the union wrapper is redundant. Strip it (see serializeOptionalChild)
		// so circular optional self-references close on the inner type, not on
		// a wrapping union node. Mirrors the tuple-member / parameter treatment.
		if member.Optional {
			member.Child = cache.serializeOptionalChild(propertyType)
		} else {
			member.Child = cache.Serialize(propertyType)
		}
	}

	cache.intern(structural, memberID)
	cache.putNode(memberID, member)
	parent.Children = append(parent.Children, reflection.NewRef(memberID))
}

func (cache *Cache) projectSignatureInto(signature *checker.Signature, node *reflection.RunType) {
	params := signature.Parameters()
	for i, paramSymbol := range params {
		paramType := cache.typeChecker.GetTypeOfSymbol(paramSymbol)
		// A trailing rest-tuple param whose expansion carries NAMES (labeled
		// elements — declaration labels or the lifted `__rtLabels` sentinel —
		// or the empty tuple) expands into positional Parameter nodes, exactly
		// as the id side folds it (typeid.signatureID): the labeled value-first
		// form and the written `(a: A) => R` share a structural id, so their
		// projections must be byte-identical too — without this the
		// first-interned site's parameter shape won at random. UNLABELED
		// non-empty tuples keep the single rest param: every spelling sharing
		// that id projects the same rest shape already, and the printed
		// `(...args: [A]) => R` round-trips.
		if i == len(params)-1 && isRestParameter(paramSymbol) {
			if expanded := cache.expandRestTupleParam(paramType, node); expanded {
				continue
			}
		}
		position := i
		parameter := &reflection.RunType{
			Kind:     reflection.KindParameter,
			Name:     paramSymbol.Name,
			Position: &position,
		}
		if paramSymbol.Flags&ast.SymbolFlagsOptional != 0 || isOptionalParameter(paramSymbol) {
			parameter.Optional = true
		}
		if isRestParameter(paramSymbol) {
			parameter.Flags = append(parameter.Flags, "rest")
		}
		// Optional parameters carry `T | undefined` at the symbol-type
		// layer; the Optional flag IS the "undefined-permitted" signal so
		// the union wrapper is redundant. Mirrors the equivalent stripping
		// in appendProperty and projectTuple.
		if parameter.Optional {
			parameter.Child = cache.serializeOptionalChild(paramType)
		} else {
			parameter.Child = cache.Serialize(paramType)
		}
		applyParameterDefault(parameter, paramSymbol)
		structural := fmt.Sprintf("_pa_%s_%s_%d", node.ID, paramSymbol.Name, i)
		paramID, err := cache.uniqueDict(structural, cache.opts.hashLength())
		if err != nil {
			paramID = "x_pa_" + structural
		}
		parameter.ID = paramID
		cache.intern(structural, paramID)
		cache.putNode(paramID, parameter)
		node.Parameters = append(node.Parameters, reflection.NewRef(paramID))
	}
	node.Return = cache.Serialize(cache.typeChecker.GetReturnTypeOfSignature(signature))
}

// expandRestTupleParam projects a trailing rest-tuple parameter as positional
// Parameter nodes when — and only when — the id side folds it that way with
// NAMES: a FIXED tuple whose elements are labeled (declaration labels, or the
// lifted `__rtLabels` carrier the value-first object form brands), or the
// empty tuple (whose id equals the written `() => R`). Element optionality
// mirrors the id fold exactly: no Optional flag, the raw `T | undefined` slot
// type as the child — which is also what the id-equal written spelling
// `(a: A, b: B | undefined) => R` projects. Returns false to keep the single
// rest parameter (unlabeled non-empty tuples, genuine variadics, non-tuple
// rest types).
func (cache *Cache) expandRestTupleParam(paramType *checker.Type, node *reflection.RunType) bool {
	restTuple, labelOverride := paramType, []string(nil)
	if !checker.IsTupleType(restTuple) {
		carrierTuple, labels, ok := typeid.SplitLabeledTupleIntersection(cache.typeChecker, paramType)
		if !ok {
			return false
		}
		restTuple, labelOverride = carrierTuple, labels
	}
	typeArguments := cache.typeChecker.GetTypeArguments(restTuple)
	elementInfos := restTuple.TargetTupleType().ElementInfos()
	labels := make([]string, 0, len(typeArguments))
	for i := range typeArguments {
		label := ""
		if i < len(elementInfos) {
			flags := elementInfos[i].TupleElementFlags()
			if flags&checker.ElementFlagsRest != 0 || flags&checker.ElementFlagsVariadic != 0 {
				return false
			}
			label = typeid.TupleElementLabel(elementInfos[i])
		}
		if i < len(labelOverride) {
			label = labelOverride[i]
		}
		labels = append(labels, label)
	}
	// TS labels every slot or none, so probing the first element decides.
	if len(labels) > 0 && labels[0] == "" {
		return false
	}
	for i, typeArgument := range typeArguments {
		position := i
		parameter := &reflection.RunType{
			Kind:     reflection.KindParameter,
			Name:     labels[i],
			Position: &position,
			Child:    cache.Serialize(typeArgument),
		}
		structural := fmt.Sprintf("_pa_%s_%s_%d", node.ID, labels[i], i)
		paramID, err := cache.uniqueDict(structural, cache.opts.hashLength())
		if err != nil {
			paramID = "x_pa_" + structural
		}
		parameter.ID = paramID
		cache.intern(structural, paramID)
		cache.putNode(paramID, parameter)
		node.Parameters = append(node.Parameters, reflection.NewRef(paramID))
	}
	return true
}

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

func (cache *Cache) projectEnum(tsType *checker.Type, node *reflection.RunType) {
	node.Kind = reflection.KindEnum
	if symbol := tsType.Symbol(); symbol != nil {
		node.TypeName = symbol.Name
		// Walk member symbols and read their values.
		// For TypeFlagsEnum, the type is the enum container; its symbol's
		// Exports map members to symbols whose ValueDeclaration is the
		// EnumMember node carrying the literal value.
		members := enumMembers(tsType)
		if len(members) > 0 {
			node.EnumVal = make(map[string]any, len(members))
			node.Values = make([]any, 0, len(members))
			allString, allNumber := true, true
			for _, member := range members {
				node.EnumVal[member.name] = member.value
				node.Values = append(node.Values, member.value)
				if _, ok := member.value.(string); !ok {
					allString = false
				}
				if _, ok := member.value.(int64); !ok {
					if _, ok := member.value.(float64); !ok {
						allNumber = false
					}
				}
			}
			switch {
			case allString:
				node.IndexT = &reflection.RunType{Kind: reflection.KindString, ID: "_enumIdx_string"}
			case allNumber:
				node.IndexT = &reflection.RunType{Kind: reflection.KindNumber, ID: "_enumIdx_number"}
			default:
				node.IndexT = &reflection.RunType{Kind: reflection.KindUnion, ID: "_enumIdx_mixed"}
			}
		}
	}
}

type enumMember struct {
	name  string
	value any
}

func enumMembers(tsType *checker.Type) []enumMember {
	symbol := tsType.Symbol()
	if symbol == nil || symbol.Exports == nil {
		return nil
	}
	out := make([]enumMember, 0, len(symbol.Exports))
	for name, memberSymbol := range symbol.Exports {
		if memberSymbol == nil || memberSymbol.ValueDeclaration == nil {
			continue
		}
		out = append(out, enumMember{name: name, value: readEnumMemberValue(memberSymbol)})
	}
	// Sort by declaration position so the auto-increment pass below sees
	// members in source order. Alphabetical sort would break
	// `enum E { A, B = 'x', C }` because the auto-increment for C
	// would look at the wrong predecessor.
	sort.Slice(out, func(i, j int) bool {
		ai := declarationPos(symbol.Exports[out[i].name])
		bi := declarationPos(symbol.Exports[out[j].name])
		return ai < bi
	})
	// Auto-increment pass: members without an initializer take the
	// previous numeric value + 1, starting from 0. Mirrors TypeScript's
	// enum semantics — the previous serializer left these as nil because
	// "tsgo's evaluator would handle it" wasn't wired in. Doing it here
	// keeps the enum.spec.ts case `enum Color {Red, Green='green', Blue=2}`
	// resolving Red=0 (instead of null) so the RT validate chain
	// `v === 0 || v === 'green' || v === 2` matches Color.Red at runtime.
	var nextAuto int64
	for i := range out {
		switch existing := out[i].value.(type) {
		case nil:
			out[i].value = nextAuto
			nextAuto++
		case int64:
			nextAuto = existing + 1
		case float64:
			nextAuto = int64(existing) + 1
		}
	}
	return out
}

func declarationPos(symbol *ast.Symbol) int {
	if symbol == nil || symbol.ValueDeclaration == nil {
		return 0
	}
	return symbol.ValueDeclaration.Pos()
}

// uniqueSymbolDescription extracts the description argument of a
// `Symbol(<desc>)` call when the type is `typeof <const>` and the
// const's initializer is a literal call. Returns the binding name
// (tsType.Symbol().Name) as a fallback — preserves the v1 behavior
// for declarations we can't statically resolve.
//
// The reference validates symbol literals via runtime `.description` matching
// (literal.ts:103), so the RT emit needs the same string the
// constructor was called with, not the binding identifier.
func uniqueSymbolDescription(tsType *checker.Type) string {
	symbol := tsType.Symbol()
	if symbol == nil {
		return ""
	}
	fallback := symbol.Name
	declaration := symbol.ValueDeclaration
	if declaration == nil {
		return fallback
	}
	var initializer *ast.Node
	if declaration.Kind == ast.KindVariableDeclaration {
		variableDecl := declaration.AsVariableDeclaration()
		if variableDecl != nil {
			initializer = variableDecl.Initializer
		}
	}
	if initializer == nil || initializer.Kind != ast.KindCallExpression {
		return fallback
	}
	callExpression := initializer.AsCallExpression()
	if callExpression == nil || callExpression.Arguments == nil {
		// `Symbol()` with no description — empty description matches
		// `Symbol().description === undefined`. Returning "" here makes
		// the RT compare `v.description === ''`, which is wrong for the
		// no-description case but the reference has the same gap, so we leave it
		// until a spec case forces the issue.
		return ""
	}
	args := callExpression.Arguments.Nodes
	if len(args) == 0 {
		return ""
	}
	first := args[0]
	if first == nil {
		return ""
	}
	switch first.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return first.Text()
	}
	return fallback
}

func readEnumMemberValue(symbol *ast.Symbol) any {
	declaration := symbol.ValueDeclaration
	if declaration == nil || declaration.Kind != ast.KindEnumMember {
		return nil
	}
	enumMemberNode := declaration.AsEnumMember()
	if enumMemberNode == nil || enumMemberNode.Initializer == nil {
		// No initializer — implicit numeric. The auto-increment pass in
		// enumMembers fills these in based on the previous member's
		// numeric value (or 0 for the first one). Returning nil here is
		// the sentinel that pass looks for.
		return nil
	}
	initializer := enumMemberNode.Initializer
	switch initializer.Kind {
	case ast.KindStringLiteral, ast.KindNoSubstitutionTemplateLiteral:
		return initializer.Text()
	case ast.KindNumericLiteral:
		// Best effort — preserve the original textual form.
		return parseNumberLiteral(initializer.Text())
	case ast.KindTrueKeyword:
		return true
	case ast.KindFalseKeyword:
		return false
	}
	return nil
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

func isClass(tsType *checker.Type) bool {
	flags := tsType.ObjectFlags()
	if flags&checker.ObjectFlagsClass != 0 {
		return true
	}
	if flags&checker.ObjectFlagsReference != 0 {
		if target := tsType.Target(); target != nil && target.ObjectFlags()&checker.ObjectFlagsClass != 0 {
			return true
		}
	}
	return false
}

func parseNumberLiteral(text string) any {
	if asInt, err := strconv.ParseInt(text, 10, 64); err == nil {
		return asInt
	}
	if asFloat, err := strconv.ParseFloat(text, 64); err == nil {
		return asFloat
	}
	return text
}

// stableMemberName strips the checker-instance symbol id off a late-bound
// symbol-keyed member name ("\xFE@toPrimitive@5" → "\xFE@toPrimitive").
// tsgo names members declared with a computed symbol key as
// `<InternalSymbolNamePrefix>@<description>@<symbolId>`, where symbolId is
// an allocation counter of the checker that materialized the symbol —
// different pool checkers (and different sessions) mint different ids for
// the same member, which would leak checker identity into member names,
// structural ids, and wire ids. The property INDEX in the `_pr_` scheme
// keeps same-name symbol members distinct within one parent. Mirrored in
// internal/cachegen/runtype/typeid (typeid can't import its parent) —
// keep them in sync.
func stableMemberName(name string) string {
	if len(name) < 2 || name[0] != 0xFE || name[1] != '@' {
		return name
	}
	at := strings.LastIndexByte(name, '@')
	if at <= 1 || at == len(name)-1 {
		return name
	}
	for i := at + 1; i < len(name); i++ {
		if name[i] < '0' || name[i] > '9' {
			return name
		}
	}
	return name[:at]
}

// isSafeName returns true when name can be used with dot-accessor
// syntax (obj.foo); false when bracket notation is required
// (obj["weird name"]). Mirrors the `^[a-zA-Z_][a-zA-Z0-9_]*$` check
// (ref: packages/run-types/src/lib/utils.ts:90) — minus
// the `typeof name === 'number'` short-circuit. The reference treats
// number-typed keys as safe because `obj[5]` is valid, but in our wire
// model all names are strings; leading-digit names ("5") are rejected
// and dot access on a numeric-stringified name (`obj.5`) is a JS syntax
// error anyway. Hand-rolled byte loop — this runs once per projected
// property and the regexp engine was measurable churn.
func isSafeName(name string) bool {
	if name == "" {
		return false
	}
	for i := 0; i < len(name); i++ {
		c := name[i]
		switch {
		case c >= 'a' && c <= 'z', c >= 'A' && c <= 'Z', c == '_':
		case c >= '0' && c <= '9':
			if i == 0 {
				return false
			}
		default:
			return false
		}
	}
	return true
}

// ─────────────────── cross-site mock-sample reconciliation ───────────────────

// reconcileSamples compares the DECLARED mock-sample pool of a type that just
// deduped onto an existing entry against the pool that entry already carries.
//
// Everything reachable here is declared-only: pattern sample AUTO-GENERATION is
// a separate later pass over interned nodes (resolver.enrichPatternSamples), so
// nothing in the cache has a generated pool yet. That is what makes provenance
// free — no flag to thread, no recomputation.
//
// Three outcomes, matching the rule that absence is not an opinion:
//
//   - the entry has no pool and the incoming one declares → ADOPT it, so a
//     declared pool is never lost to whichever site happened to intern first;
//   - the pools agree (or neither declares) → nothing to do;
//   - both declare and they differ → latch a conflict for the resolver to raise.
func (cache *Cache) reconcileSamples(id string, tsType *checker.Type) {
	node := cache.nodes[id]
	if node == nil || node.FormatAnnotation == nil {
		return
	}
	incomingAnnotation := typeid.FormatAnnotationFromType(cache.typeChecker, tsType)
	if incomingAnnotation == nil {
		return
	}
	incoming, hasIncoming := declaredSamples(incomingAnnotation.Params)
	if !hasIncoming {
		return
	}
	kept, hasKept := declaredSamples(node.FormatAnnotation.Params)
	if !hasKept {
		// Absence is not an opinion: the declared pool wins rather than being
		// dropped because the pool-less site was seen first.
		node.FormatAnnotation.Params["mockSamples"] = incomingAnnotation.Params["mockSamples"]
		return
	}
	if sameSamples(kept, incoming) {
		return
	}
	cache.sampleConflicts = append(cache.sampleConflicts, SampleConflict{
		ID:       id,
		Format:   node.FormatAnnotation.Name,
		Kept:     kept,
		Incoming: incoming,
	})
}

// declaredSamples reads a params map's `mockSamples` as a string slice. The
// second result distinguishes "declared nothing" from "declared an empty pool";
// only a non-empty declaration is an opinion worth comparing.
func declaredSamples(params map[string]any) ([]string, bool) {
	raw, ok := params["mockSamples"]
	if !ok {
		return nil, false
	}
	values, ok := raw.([]any)
	if !ok || len(values) == 0 {
		return nil, false
	}
	out := make([]string, 0, len(values))
	for _, value := range values {
		text, ok := value.(string)
		if !ok {
			return nil, false
		}
		out = append(out, text)
	}
	return out, true
}

// sameSamples compares two pools ORDER-SENSITIVELY: the order is what the mock
// generator indexes into, so two pools with the same members in a different
// order genuinely produce different values for the same seed.
func sameSamples(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for i := range left {
		if left[i] != right[i] {
			return false
		}
	}
	return true
}
