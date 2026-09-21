// Serializer: projects tsgo's *checker.Type into a reflection.RunType graph. Every resolved
// type gets a structural id, hashed (internal/cachegen/hashid) into a short wire id, so two
// structurally-equal types share one id and cache keys stay stable across builds. The Cache is
// stateful across calls and NOT safe for concurrent use. Projection is rooted ONLY at types
// passed to AssignID (see the BOUNDED-SCOPE INVARIANT block in internal/compiler/resolver/scan.go);
// children are walked from those roots, never the file's top-level declarations.
package runtype

import (
	"errors"
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Options configures the hash length: zero uses the hashid default, longer ids trade source size for fewer collisions.
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

	// Same *checker.Type seen twice → same wire id, no re-walk.
	byPtr map[*checker.Type]string

	// Where dedup happens: same structural id, whatever the pointer identity, → same wire id.
	byStructural map[string]string

	// Reverse of byStructural: StructuralForHash lets the disk cache re-resolve a cached body's child refs and spot drift.
	byID map[string]string

	// Type table keyed by wire id. nodes[id] is the canonical entry.
	nodes map[string]*reflection.RunType

	// Insertion order, read by Added(); Dump sorts by id instead.
	insertOrder []string

	// Wire ids reached from each scanned file's call sites; the resolver fills it, so the cache stays resolution-agnostic.
	fileTypeIDs map[string]map[string]struct{}

	// Per wire id, the files that DECLARE the type; local per node, transitivity comes from fileTypeIDs. See declfiles.go.
	declFiles map[string][]string

	dict        *hashid.Dict
	typeChecker *checker.Checker
	idComputer  *typeid.Computer
	// Carries the program's (overlay) filesystem so the package-name gate recognises `DataOnly<T>`
	// declared in an in-memory mion package; a nil filesystem falls back to os.ReadFile.
	markerOpts marker.Options

	// One id computer per foreign checker: each pool checker owns a private *checker.Type universe,
	// so the pointer-keyed memos must not mix.
	foreignComputers map[*checker.Checker]*typeid.Computer

	// Wire ids whose projectType is on the stack; a back-edge to one means the node is inside its own subtree, i.e. circular.
	inProgress map[string]bool

	// Ids found circular while projecting; IsCircular goes on the final node, as assignID's placeholder is overwritten.
	circularIDs map[string]bool

	// Latches when the id computer hit typeid.maxWalkDepth; assignID then returns a placeholder
	// instead of a truncated node, and the resolver's per-site commit resets it and raises MKR009/MKR008.
	depthExceeded bool
	// The self-instantiating generic's name (→ MKR009), or "" (→ MKR008).
	depthCulprit string
	// Samples are NOT id-relevant, so two sites differing only in their declared pools share ONE entry.
	// The residue: when both DECLARE and the pools differ, whichever interned first wins, so unrelated
	// edits can change that. Latched here, raised by the resolver, which owns the sites.
	sampleConflicts []SampleConflict

	// Two distinct structural ids landing on the same short id; the resolver takes it (→ MKR014), and the
	// enrichment bridge, which runs its own cache outside the resolver, reads it as a plain error.
	hashCollision *HashCollision
	// Numbers the placeholder ids minted after a collision so the doomed walk cannot merge the colliding types into one entry.
	collisionSeq int

	// `overrideX<T>(pureFn)` table: BASE structural key → family op key → cfn body hash. Threaded into every
	// id computer so structural ids fold the override suffix; SetOverrides MUST run before any AssignID.
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

// SetMarkerOptions records the accepted marker package set plus the program's filesystem for the package-name gate.
// The resolver re-calls it on every program swap so the gate reads package.json from the current overlay.
func (cache *Cache) SetMarkerOptions(markerOpts marker.Options) { cache.markerOpts = markerOpts }

// Size returns the number of distinct types currently interned.
func (cache *Cache) Size() int { return len(cache.nodes) }

// putNode stamps the derived Family / NotSupported fields once (entries are immutable after intern) and registers the node.
func (cache *Cache) putNode(id string, node *reflection.RunType) {
	reflection.PopulateFamily(node)
	cache.nodes[id] = node
	cache.insertOrder = append(cache.insertOrder, id)
}

// NodesView returns the live id→node table for read-only ref resolution (the typefns walkers' RefTable).
// Callers MUST NOT mutate the map or the nodes: the cache keeps ownership and keeps inserting on later scans.
// Family/NotSupported are stamped at intern time, so entries are render-ready with no PopulateFamily pass.
func (cache *Cache) NodesView() map[string]*reflection.RunType { return cache.nodes }

// Clear drops every interned type and resets the hash dictionary. Not safe to call concurrently: the cache is not thread-safe.
func (cache *Cache) Clear() {
	cache.byPtr = make(map[*checker.Type]string)
	cache.byStructural = make(map[string]string)
	cache.byID = make(map[string]string)
	cache.nodes = make(map[string]*reflection.RunType)
	cache.insertOrder = cache.insertOrder[:0]
	cache.fileTypeIDs = make(map[string]map[string]struct{})
	cache.declFiles = make(map[string][]string)
	cache.dict = hashid.New()
	// A fresh dict cannot be holding the old one's collision.
	cache.hashCollision = nil
	cache.collisionSeq = 0
	cache.foreignComputers = nil
	cache.inProgress = make(map[string]bool)
	cache.circularIDs = make(map[string]bool)
	cache.overrides = nil
	if cache.typeChecker != nil {
		cache.idComputer = typeid.New(cache.typeChecker)
	}
}

// SetOverrides installs the `overrideX<T>(pureFn)` table so structural ids fold the `|cfn:…` suffix and projected
// nodes are stamped with RunType.Overrides. MUST run before any AssignID: it recreates the id computers, whose
// caches must not already hold pre-fold ids. A nil/empty table is a no-op fold.
func (cache *Cache) SetOverrides(overrides map[string]map[string]string) {
	cache.overrides = overrides
	if cache.typeChecker != nil {
		cache.idComputer = typeid.NewWithOverrides(cache.typeChecker, overrides)
	}
	cache.foreignComputers = nil
}

// Rebind points the cache at a new checker after a Program swap. byPtr is cleared, its keys being *checker.Type
// from the old Program; structural dedup survives, same shape meaning same id across Programs.
// Passing nil unbinds, leaving the cache safe to hold but unusable until a later Rebind installs a real checker.
func (cache *Cache) Rebind(typeChecker *checker.Checker) {
	cache.typeChecker = typeChecker
	if typeChecker != nil {
		cache.idComputer = typeid.NewWithOverrides(typeChecker, cache.overrides)
	} else {
		cache.idComputer = nil
	}
	// Dead after a swap: these hold pointers into the previous Program's checker state.
	cache.foreignComputers = nil
	cache.byPtr = make(map[*checker.Type]string)
	// Every per-file key belongs to the previous Program's source files, so the next scanFiles starts from empty.
	cache.fileTypeIDs = make(map[string]map[string]struct{})
	cache.declFiles = make(map[string][]string)
}

// Dump returns every interned Type sorted by wire id, so identical inputs give identical bytes across builds.
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

// Added returns the nodes inserted since `before`, which the resolver streams back to clients as incremental updates.
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

// Serialize projects tsType into the cache and returns a `KindRef` sentinel; the full Type lives in `cache.nodes[id]`.
func (cache *Cache) Serialize(tsType *checker.Type) *reflection.RunType {
	id := cache.assignID(tsType)
	return reflection.NewRef(id)
}

// serializeOptionalChild projects an optional member's child with the redundant `undefined` stripped.
// Keep it in lockstep with the id computer's optionalChildID, or structural id and projected node disagree.
func (cache *Cache) serializeOptionalChild(childType *checker.Type) *reflection.RunType {
	child := typeid.ResolveOptionalChild(cache.typeChecker, childType)
	if child.Members == nil {
		return cache.Serialize(child.Type)
	}
	return cache.serializeSyntheticUnion(child.Members)
}

// serializeSyntheticUnion projects a union from an explicit member list: an optional child keeping `null` after
// `undefined` is stripped. Its id matches typeid.SyntheticUnionStructural, so it dedups against a real union.
func (cache *Cache) serializeSyntheticUnion(members []*checker.Type) *reflection.RunType {
	structural := typeid.SyntheticUnionStructural(cache.idComputer, members)
	if id, ok := cache.byStructural[structural]; ok {
		return reflection.NewRef(id)
	}
	id := cache.uniqueDict(structural, cache.opts.hashLength())
	cache.intern(structural, id)
	node := &reflection.RunType{ID: id, Kind: reflection.KindUnion}
	// Reserve the slot before projecting members so a member that cycles back sees the id.
	cache.putNode(id, node)
	for _, member := range members {
		node.Children = append(node.Children, cache.Serialize(member))
	}
	cache.finalizeUnion(node)
	// Re-stamp Family/NotSupported: the reserve above stamped a childless node.
	reflection.PopulateFamily(node)
	cache.nodes[id] = node
	return reflection.NewRef(id)
}

// DepthExceeded reports whether the most recent walk hit typeid.maxWalkDepth; the resolver reads it to raise MKR009/MKR008.
func (cache *Cache) DepthExceeded() bool { return cache.depthExceeded }

// ResetDepthExceeded clears the depth-cap latch and the sample conflicts before a fresh top-level walk.
func (cache *Cache) ResetDepthExceeded() {
	cache.depthExceeded = false
	cache.depthCulprit = ""
	cache.sampleConflicts = nil
}

// DepthCulprit returns the cause for the latched cap: the self-instantiating generic's name, or "" for plain deep nesting.
func (cache *Cache) DepthCulprit() string { return cache.depthCulprit }

// SampleConflict is one cross-site disagreement: an entry two sites share, each
// having DECLARED a different mock-sample pool for it.
type SampleConflict struct {
	// ID is the shared cache entry both sites resolved to.
	ID string
	// Format names the format whose pool disagrees (`stringFormat`, `email`, …).
	Format string
	// Kept is the pool already interned, winner purely by being seen first; Incoming is the second site's.
	Kept     []string
	Incoming []string
}

// SampleConflicts returns the disagreements latched since the last reset.
func (cache *Cache) SampleConflicts() []SampleConflict { return cache.sampleConflicts }

// HashCollision is one type-id collision: two distinct types whose structural
// ids hash to the same short id at the configured length.
type HashCollision struct {
	// Hash is the short id both types want.
	Hash string
	// Structural is the incoming type's structural id; Owner already holds Hash.
	Structural string
	Owner      string
	// Length is the configured hash length the collision happened at.
	Length int
}

// TakeHashCollision returns the latched collision and clears it, so one collision is reported once, not by
// every site that commits after it. A pair still colliding re-latches on the next walk that hits it (the loser
// was never interned), so a watch-mode session recovers when hashLength widens instead of staying red.
func (cache *Cache) TakeHashCollision() *HashCollision {
	collision := cache.hashCollision
	cache.hashCollision = nil
	return collision
}

// AssignID projects tsType into the cache (if new) and returns its hash id, for callers needing no RunType sentinel.
func (cache *Cache) AssignID(tsType *checker.Type) string {
	return cache.assignID(tsType)
}

// AssignIDUnder projects tsType under the checker that materialized it: pool checkers each own a private
// *checker.Type universe and must never mix (upstream contract on Program.GetTypeCheckerForFile).
// Structural ids are checker-independent, so equivalent types under different checkers still dedup via byStructural.
// It swaps the bound checker + id computer for the whole projection, so it is serial-only: the parallel scan
// calls it from its single-goroutine commit phase.
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

// SerializeAtomicKind registers (or reuses) a synthetic entry for an atomic ReflectionKind without the type checker.
// The `noLiterals` resolver path uses it to redirect a unique-symbol literal to the canonical `symbol` kind, since
// tsgo's `getBaseTypeOfLiteralType` doesn't handle TypeFlagsUniqueESSymbol (see internal/compiler/resolver/scan.go).
// Today only `KindSymbol` needs this escape hatch.
func (cache *Cache) SerializeAtomicKind(kind reflection.ReflectionKind) string {
	structural := strconv.Itoa(int(kind)) + ":atomic"
	if id, ok := cache.byStructural[structural]; ok {
		return id
	}
	id := cache.uniqueDict(structural, cache.opts.hashLength())
	cache.intern(structural, id)
	cache.putNode(id, &reflection.RunType{ID: id, Kind: kind})
	return id
}

// SerializeTopLevel returns the canonical entry rather than a ref, so the top of a query result shows the full shape.
func (cache *Cache) SerializeTopLevel(tsType *checker.Type) *reflection.RunType {
	id := cache.assignID(tsType)
	return cache.nodes[id]
}

// NodeByID returns the canonical full Type for id, or nil; the enrichment and demand-scope walkers follow child KindRef slots with it.
func (cache *Cache) NodeByID(id string) *reflection.RunType {
	return cache.nodes[id]
}

// RecordFileID remembers that file's call sites reached id, so IDsForUnion can scope a scanFiles response to given files.
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

// IDsForUnion returns the deduplicated, sorted wire ids reachable from any of files: the resolver passes the
// request's explicit Files list, so the response covers those files only, NOT every file scanned in the session.
// Ids missing from the type table are dropped silently.
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

// StructuralForHash returns the structural id for an interned wire id, or "" when absent. The disk RT cache records
// (structural id, hash) pairs for a cached body's child refs at write time, and treats drift at read time as a miss.
func (cache *Cache) StructuralForHash(id string) string {
	return cache.byID[id]
}

// HashForStructural returns the wire id for a structural id, or "" if it was not interned in this build.
func (cache *Cache) HashForStructural(structural string) string {
	return cache.byStructural[structural]
}

// intern records the (structural ↔ id) pair both ways; every site minting a wire id MUST use it, or byID
// falls out of lockstep with byStructural and an interned wire id stops being recoverable.
func (cache *Cache) intern(structural, id string) {
	cache.byStructural[structural] = id
	cache.byID[id] = structural
}

// versionSalt prefixes every hash input, so one structural id maps to different short hashes across binary versions.
// Folded in via UniqueSalted, never retained per id, so the dict stores only the bare structural string.
// Read at call time, not as a package var: version_test.go swaps constants.Version mid-process.
func versionSalt() string { return constants.Version + "|" }

// uniqueDict assigns a short hash for structural via the dict. On a collision it latches for the resolver (→ MKR014)
// and returns a NUMBERED placeholder: an id derived from the shared hash alone would fold the two colliding
// structurals into ONE cache entry. The build fails on the diagnostic, so the placeholder never ships.
func (cache *Cache) uniqueDict(structural string, length int) string {
	hash, err := cache.dict.UniqueSalted(versionSalt(), structural, length)
	if err == nil {
		return hash
	}
	var collision *hashid.Collision
	if errors.As(err, &collision) && cache.hashCollision == nil {
		cache.hashCollision = &HashCollision{
			Hash:       collision.Hash,
			Structural: structural,
			Owner:      collision.Owner,
			Length:     length,
		}
	}
	cache.collisionSeq++
	return "x_c" + strconv.Itoa(cache.collisionSeq) + "_" + hashid.QuickHash(structural, length)
}

// NodesForIDs returns the canonical entries for ids, in the order supplied, skipping ids missing from the table.
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
		// Latch the cap and its cause for the resolver (→ MKR009/MKR008) and DON'T project a truncated node.
		// Over-deep types all collapse onto the shared benign placeholder; the build fails on the diagnostic anyway.
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
		// The incoming type is NOT projected on this path, so its declared pool would otherwise never be looked at.
		cache.reconcileSamples(id, tsType)
		// Same for decl files: two files declaring one shape share an id and editing EITHER must invalidate,
		// so recordDeclFiles unions the incoming file in rather than dropping the first.
		cache.recordDeclFiles(id, tsType)
		return id
	}

	id := cache.uniqueDict(structural, cache.opts.hashLength())

	cache.byPtr[tsType] = id
	cache.intern(structural, id)
	cache.recordDeclFiles(id, tsType)

	// Reserve the slot before projecting so cycles see the id.
	cache.putNode(id, &reflection.RunType{ID: id, Kind: typeid.KindOf(cache.typeChecker, tsType)})

	// In-progress, so a child resolving back to this id flags it circular; the flag goes on the final node,
	// since the placeholder above is overwritten on the next line.
	cache.inProgress[id] = true
	node := cache.projectType(tsType, id)
	delete(cache.inProgress, id)
	if cache.circularIDs[id] && node != nil {
		node.IsCircular = true
	}
	if node != nil {
		cache.stampOverrides(node, tsType)
	}
	// Replace the placeholder in place: insertOrder already holds id.
	reflection.PopulateFamily(node)
	cache.nodes[id] = node
	return id
}

// stampOverrides copies the `overrideX<T>(pureFn)` families targeting tsType onto the node so the type-fn emitter
// can substitute a cfn redirect. Looked up by the node's BASE structural key; the copy keeps the node from
// sharing the override table's map.
func (cache *Cache) stampOverrides(node *reflection.RunType, tsType *checker.Type) {
	if cache.idComputer == nil || len(cache.overrides) == 0 {
		return
	}
	// The lookup key must come from a COLD computer, exactly as the fold pass built the map's keys: a warm
	// computer's cache legitimately holds ROOT-FORM spellings of cycle members, and a base key composed from
	// those differs from the fold key even though both strings are valid.
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

// internEmpty creates a placeholder entry for nil/unknown types so consumers never see a dangling ref.
func (cache *Cache) internEmpty(kind reflection.ReflectionKind, markerName string) string {
	structural := "_empty_" + markerName
	if id, ok := cache.byStructural[structural]; ok {
		return id
	}
	id := cache.uniqueDict(structural, cache.opts.hashLength())
	cache.intern(structural, id)
	cache.putNode(id, &reflection.RunType{ID: id, Kind: kind, Flags: []string{markerName}})
	return id
}

// ---------------------------------------------------------------------------
// projection — the id is already set by assignID, only kind-specific contents are filled here.
// ---------------------------------------------------------------------------

func (cache *Cache) projectType(tsType *checker.Type, id string) *reflection.RunType {
	node := &reflection.RunType{ID: id}
	flags := tsType.Flags()

	// A builders object-shape helper alias (see isBuilderInternalAlias) is skipped: it is compiler-internal and its
	// type arguments are the raw builder config, so reflecting them leaks the RunType wrapper into the bundle.
	// Left anonymous, the switch below still projects the modeled object shape from the merged properties.
	if alias := checker.Type_alias(tsType); alias != nil && alias.Symbol() != nil && !isBuilderInternalAlias(alias.Symbol(), cache.markerOpts) {
		node.TypeName = alias.Symbol().Name
		if typeArguments := alias.TypeArguments(); len(typeArguments) > 0 {
			node.TypeArguments = make([]*reflection.RunType, 0, len(typeArguments))
			for _, typeArgument := range typeArguments {
				node.TypeArguments = append(node.TypeArguments, cache.Serialize(typeArgument))
			}
		}
	} else if name, ok := dataOnlyTypeName(tsType, cache.markerOpts); ok {
		// DataOnly<T>'s conditional + key-filtering mapped type strips the alias chain before the result reaches
		// us, so the alias check above misses. Recognised explicitly, the entry stays external in default inline
		// mode: DefaultIsRTInlined inlines a TypeName-empty KindObjectLiteral, wrong for a brand-named view.
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
		// A numeric ENUM member (`Color.Red = 0`) is a NumberLiteral whose TypeToString is the member NAME
		// ("Color.Red"), so a validator built from it would check `=== "Color.Red"` and never match the runtime
		// number. Read the underlying value instead; plain number literals keep TypeToString.
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
		// JSON numbers can't carry arbitrary-precision bigint: emit a decimal string + flag so the renderer wraps with `BigInt(...)`.
		node.Literal = fmt.Sprintf("%v", tsType.AsLiteralType().Value())
		node.Flags = append(node.Flags, "bigint")

	case flags&checker.TypeFlagsUniqueESSymbol != 0:
		node.Kind = reflection.KindLiteral
		// Literal-symbol validation compares `.description` at runtime, the string `Symbol(<desc>)` was called
		// with, while tsgo's symbol.Name is the BINDING identifier (e.g. `sym`). What cannot be resolved
		// statically falls back to the binding name and fails validation gracefully rather than panicking.
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
		// A single enum member used as a type emits the PARENT enum, tagged with the member name.
		cache.projectEnum(tsType, node)
		if symbol := tsType.Symbol(); symbol != nil {
			node.Flags = append(node.Flags, "enumMember:"+symbol.Name)
		}

	case flags&checker.TypeFlagsTemplateLiteral != 0:
		// Project the text segments + placeholder kinds onto Literal so the emit can compile an anchored regex.
		node.Kind = reflection.KindTemplateLiteral
		cache.projectTemplateLiteral(tsType, node)

	case flags&checker.TypeFlagsUnion != 0:
		node.Kind = reflection.KindUnion
		members := tsType.Distributed()
		for _, member := range members {
			node.Children = append(node.Children, cache.Serialize(member))
		}
		// Safe order + discriminator marks computed once here, so every consumer reads ready-baked metadata.
		cache.finalizeUnion(node)

	case flags&checker.TypeFlagsIntersection != 0:
		// Collapsed in Go so consumers never see a raw KindIntersection on the wire. See intersection_collapse.go.
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

// projectTemplateLiteral serializes a template literal type onto Literal as
// `{templateLiteral: {texts, placeholders}}`, so the RT emit can build an anchored regex.
// `texts` is always one element longer than `placeholders`, per tsgo's TemplateLiteralType.
func (cache *Cache) projectTemplateLiteral(tsType *checker.Type, node *reflection.RunType) {
	tplType := tsType.AsTemplateLiteralType()
	if tplType == nil {
		return
	}
	texts := tplType.Texts()
	types := tplType.Types()
	// []any, not []map[string]any: the read side asserts `inner["placeholders"].([]any)`, and Go checks the
	// slice's concrete type, so the more specific element type would silently fail to match.
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

// templateSpanWireShape converts a placeholder type to its wire form for the templateLiteral.placeholders array.
// It handles literal, string, number, bigint, any and unknown spans; anything else falls back to a string span.
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
	// A `string`-shaped fallback keeps the validator open-ended rather than rejecting every input.
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

	// GetTypeArguments works only on TypeReference targets: an array-LIKE mapped hybrid passes IsArrayLikeType
	// with no reference target and would segfault the checker, hence the Reference gate (id twin: typeid.objectID).
	if cache.typeChecker.IsArrayLikeType(tsType) && tsType.ObjectFlags()&checker.ObjectFlagsReference != 0 {
		typeArguments := cache.typeChecker.GetTypeArguments(tsType)
		if len(typeArguments) > 0 {
			node.Kind = reflection.KindArray
			node.Child = cache.Serialize(typeArguments[0])
			return
		}
	}

	// Temporal builtins promote to KindClass like Date/Map/Set; checked first because they are namespace-qualified.
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
			// tsgo declares these as lib.d.ts interfaces (no ObjectFlagsClass); promoting them to KindClass with
			// the builtin marker is what makes the footer wire up `t.classType = globalThis.<Name>`.
			cache.projectClass(tsType, node)
			return
		}
		// Everything that is NOT data, taken whole: the supported natives are dispatched above, so anything
		// binary or standard-library declared reaching here is promoted to KindClass + SubKindNonSerializable,
		// and its members are never walked.
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

// projectTuple projects a tuple's members. labelOverride, one entry per element, is the lifted `__rtLabels`
// sentinel from the value-first object form: it replaces the declaration labels so the node comes out
// byte-identical to the type-first labeled tuple sharing its structural id. Nil reads LabeledDeclaration labels.
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
		// tsgo types an optional slot as `T | undefined`, but the reflection shape keeps the optional bit on
		// the TupleMember with the inner type staying `T`, so undefined is stripped.
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
			// .Text() is undefined on the labeled Parameter / NamedTupleMember wrapper, the label living on the
			// inner binding name. Mirrors getTupleElementLabel in the tsgo checker's internal/checker/relater.go.
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
		// The slot index is in the id: two members with the same payload at different positions must not dedup.
		structural := fmt.Sprintf("_tm_%s_%d", node.ID, i)
		memberID := cache.uniqueDict(structural, cache.opts.hashLength())
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
	// Interfaces have no alias symbol the way `type X = {…}` does, but the inlining predicate treats NAMED types
	// as dedupe-worthy externals, so an interface must carry its name too. TypeName never participates in
	// structural ids, so two same-shape types still collapse to one id. Inherited members are already merged
	// into `properties` above; .Extends is for explicit tree walks.
	if symbol := tsType.Symbol(); symbol != nil && symbol.Flags&ast.SymbolFlagsInterface != 0 {
		if node.TypeName == "" {
			node.TypeName = symbol.Name
		}
		for _, baseType := range typeid.BaseTypesOf(cache.typeChecker, tsType) {
			node.Extends = append(node.Extends, cache.Serialize(baseType))
		}
	}
}

func (cache *Cache) projectClass(tsType *checker.Type, node *reflection.RunType) {
	node.Kind = reflection.KindClass
	// Before the symbol-name switch: the bare name ("PlainDate") is ambiguous, TemporalInfoForType gates on the namespace.
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
			// The BUILTIN name, not symbolName: a type can qualify through its base chain (`class MyBytes extends
			// Uint8Array`), and the footer's `classType = globalThis.<name>` resolves to undefined for the
			// subclass's own name, while the matched base always exists.
			if builtin, ok := typeid.NotDataBuiltinOf(cache.typeChecker, tsType); ok {
				node.ClassRef = &reflection.ClassRef{Builtin: builtin}
				node.SubKind = reflection.SubKindNonSerializable
			} else {
				node.ClassRef = &reflection.ClassRef{Name: symbolName}
			}
		}
	}
	// GetTypeArguments panics on a plain interface (the lib.d.ts Date one), hence the ObjectFlagsReference guard.
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
	// Builtin classes project ATOMICALLY: subKind + classRef (+ the Map/Set Arguments above) fully describe them,
	// and every consumer keys on subKind rather than walking lib members. Expanding the lib interface would
	// intern dozens of nodes per builtin whose shape varies with the loaded TS libs: an unstable structural id.
	if node.ClassRef != nil && node.ClassRef.Builtin != "" {
		return
	}
	// Inherited members are already merged into GetPropertiesOfType below; ExtendsArguments is for explicit walks.
	// typeid.BaseTypesOf handles the Reference-instantiation case (`class B extends A<string>`), where a bare
	// GetBaseTypes call would crash.
	for _, baseType := range typeid.BaseTypesOf(cache.typeChecker, tsType) {
		node.ExtendsArguments = append(node.ExtendsArguments, cache.Serialize(baseType))
	}
	if symbol := tsType.Symbol(); symbol != nil {
		for _, implementedType := range collectImplementsTypes(cache.typeChecker, symbol) {
			node.Implements = append(node.Implements, cache.Serialize(implementedType))
		}
	}
	properties := cache.typeChecker.GetPropertiesOfType(tsType)
	// Static members live on the symbol's Exports table, not on the instance type, so appending them is what
	// sends static properties / methods down the same projection path.
	if symbol := tsType.Symbol(); symbol != nil {
		properties = appendStaticMembers(properties, symbol)
	}
	cache.projectMembersInto(tsType, node, properties, nil, true)
}

// appendMapArguments wraps Map<K,V>'s two type arguments as synthetic KindParameter members tagged with
// SubKindMapKey / SubKindMapValue. Each wrapper takes its own `_pa_<parentId>_<n>` id so it joins the cache.
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

// appendSetArguments wraps Set<T>'s type argument as a synthetic KindParameter tagged SubKindSetItem. Symmetric to appendMapArguments.
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

// newNativeParameter builds a synthetic KindParameter wrapper for a Map or Set type argument, registers it under
// a `_pa_<parent>_<i>` id, and returns a ref the caller can splice into node.Arguments.
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
	wrapperID := cache.uniqueDict(structural, cache.opts.hashLength())
	wrapper.ID = wrapperID
	cache.intern(structural, wrapperID)
	cache.putNode(wrapperID, wrapper)
	return reflection.NewRef(wrapperID)
}

// appendStaticMembers extends instanceProps with the class symbol's Exports, skipping names that start with
// the InternalSymbolNamePrefix sentinel (constructor, prototype slot, and so on).
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
		// `prototype` reaches class types through the constructor symbol and produces self-recursive children.
		// Class projections only: an interface or object literal may legally have a property named "prototype".
		if asClass && propertySymbol != nil && propertySymbol.Name == "prototype" {
			continue
		}
		// The format / slot sentinels are never real properties: the collapse has already lifted them onto
		// node.FormatAnnotation / the check slots, so projecting them too would surface them on the wire
		// shape. Twin of the typeid.memberIDs skip.
		if propertySymbol != nil &&
			(typeid.IsFormatSentinelPropName(propertySymbol.Name) ||
				typeid.IsContainsSentinelPropName(propertySymbol.Name) || typeid.IsLabelsSentinelPropName(propertySymbol.Name)) {
			continue
		}
		// Members inherited from a default-lib global (Error's name/message/stack) are NOT excluded: they are
		// projected NON-ENUMERABLE-GUARDED, and emitters gate the by-name write on a runtime enumerability
		// check, so a vanilla error instance skips them (no stack leak) and an enumerable one serializes.
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
		indexID := cache.uniqueDict(structural, cache.opts.hashLength())
		indexNode.ID = indexID
		cache.intern(structural, indexID)
		cache.putNode(indexID, indexNode)
		node.Children = append(node.Children, reflection.NewRef(indexID))
	}
	for i, signature := range callSignatures {
		callNode := &reflection.RunType{Kind: reflection.KindCallSignature}
		// Id BEFORE projecting: parameter nodes intern under the owning node's id, and an empty id collides them all.
		structural := fmt.Sprintf("_cs_%s_%d", node.ID, i)
		callID := cache.uniqueDict(structural, cache.opts.hashLength())
		callNode.ID = callID
		cache.projectSignatureInto(signature, callNode)
		cache.intern(structural, callID)
		cache.putNode(callID, callNode)
		node.Children = append(node.Children, reflection.NewRef(callID))
	}
}

func (cache *Cache) appendProperty(parent *reflection.RunType, symbol *ast.Symbol, asClass bool, index int) {
	propertyType := cache.typeChecker.GetTypeOfSymbol(symbol)

	// A property typed as a single-call-signature function with no other members is the `method` form.
	isMethod := false
	if propertyType != nil {
		signatures := cache.typeChecker.GetSignaturesOfType(propertyType, checker.SignatureKindCall)
		if len(signatures) > 0 && len(cache.typeChecker.GetPropertiesOfType(propertyType)) == 0 {
			isMethod = true
		}
	}

	memberName := stableMemberName(symbol.Name)
	member := &reflection.RunType{Name: memberName}
	// A non-enumerable-guarded member is projected as OPTIONAL, the wire may omit it, so validators accept its
	// absence. Mirrors typeid.memberID through the shared typeid.IsNonEnumerable, so id and projection can't
	// drift; NonEnumerable additionally tells the emitters to gate the write on enumerability.
	guarded := typeid.IsNonEnumerable(symbol)
	if symbol.Flags&ast.SymbolFlagsOptional != 0 || guarded {
		member.Optional = true
	}
	member.NonEnumerable = guarded
	member.IsSafeName = isSafeName(memberName)
	applyMemberModifiers(member, symbol, asClass)

	// The member id must exist BEFORE a signature projects into it: parameters intern under
	// `_pa_<member id>_<name>_<i>`, so an empty id collides every same-named parameter onto one node.
	structural := fmt.Sprintf("_pr_%s_%s_%d", parent.ID, memberName, index)
	memberID := cache.uniqueDict(structural, cache.opts.hashLength())
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
		// The Optional flag IS the "undefined-permitted" signal, so the `T | undefined` wrapper is redundant;
		// stripping it also closes a circular optional self-reference on the inner type, not on a union node.
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
		// A trailing rest-tuple param whose expansion carries NAMES expands into positional Parameter nodes,
		// exactly as the id side folds it (typeid.signatureID): the labeled value-first form and the written
		// `(a: A) => R` share a structural id, so without this the first-interned site's shape won at random.
		// UNLABELED non-empty tuples keep the single rest param, every spelling of that id projecting alike.
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
		// The Optional flag IS the "undefined-permitted" signal, so the union wrapper is stripped here too,
		// as in appendProperty and projectTuple.
		if parameter.Optional {
			parameter.Child = cache.serializeOptionalChild(paramType)
		} else {
			parameter.Child = cache.Serialize(paramType)
		}
		applyParameterDefault(parameter, paramSymbol)
		structural := fmt.Sprintf("_pa_%s_%s_%d", node.ID, paramSymbol.Name, i)
		paramID := cache.uniqueDict(structural, cache.opts.hashLength())
		parameter.ID = paramID
		cache.intern(structural, paramID)
		cache.putNode(paramID, parameter)
		node.Parameters = append(node.Parameters, reflection.NewRef(paramID))
	}
	node.Return = cache.Serialize(cache.typeChecker.GetReturnTypeOfSignature(signature))
}

// expandRestTupleParam projects a trailing rest-tuple parameter as positional Parameter nodes only when the id
// side folds it that way WITH NAMES: a FIXED tuple with labeled elements (declaration labels or the lifted
// `__rtLabels` carrier), or the empty tuple, whose id equals the written `() => R`. Element optionality mirrors
// the id fold exactly: no Optional flag, the raw `T | undefined` slot type as the child. False keeps the single
// rest parameter (unlabeled non-empty tuples, genuine variadics, non-tuple rest types).
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
		paramID := cache.uniqueDict(structural, cache.opts.hashLength())
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
		// For TypeFlagsEnum the type is the enum container: its symbol's Exports hold the members, whose
		// ValueDeclaration is the EnumMember node carrying the literal value.
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
	// Declaration order, not alphabetical: the auto-increment pass below needs each member's real predecessor
	// (`enum E { A, B = 'x', C }`).
	sort.Slice(out, func(i, j int) bool {
		ai := declarationPos(symbol.Exports[out[i].name])
		bi := declarationPos(symbol.Exports[out[j].name])
		return ai < bi
	})
	// Auto-increment pass, as TypeScript's enum semantics require: a member with no initializer takes the
	// previous numeric value + 1, starting from 0, so `enum Color {Red, Green='green', Blue=2}` validates
	// Red as 0 rather than null.
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

// uniqueSymbolDescription extracts the description argument of a `Symbol(<desc>)` call when the type is
// `typeof <const>`, falling back to the binding name for declarations that don't resolve statically.
// Symbol literals are validated by matching runtime `.description`, so the emit needs the constructor's string.
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
		// `Symbol()` with no description: returning "" makes the RT compare `v.description === ''`, a known
		// gap, since the real description is undefined.
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
		// nil is the sentinel the auto-increment pass in enumMembers looks for.
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

// stableMemberName strips the checker-instance symbol id off a late-bound symbol-keyed member name
// ("\xFE@toPrimitive@5" → "\xFE@toPrimitive"): that trailing id is an allocation counter of the checker that
// materialized the symbol, so keeping it would leak checker identity into member names and wire ids.
// The property INDEX in the `_pr_` scheme keeps same-name symbol members distinct within one parent.
// Mirrored in internal/cachegen/runtype/typeid (which can't import its parent) — keep them in sync.
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

// isSafeName reports whether name works with dot access (obj.foo) rather than brackets (obj["weird name"]),
// i.e. `^[a-zA-Z_][a-zA-Z0-9_]*$`. Every name is a string in our wire model, so leading-digit names ("5") are
// rejected: dot access on a numeric-stringified name (`obj.5`) is a JS syntax error anyway.
func isSafeName(name string) bool { return reflection.IsSafeName(name) }

// ─────────────────── cross-site mock-sample reconciliation ───────────────────

// reconcileSamples compares the DECLARED mock-sample pool of a type that just deduped onto an existing entry
// against the pool that entry already carries. Everything reachable here is declared-only: pattern sample
// AUTO-GENERATION is a later pass over interned nodes (resolver.enrichPatternSamples), so no cached pool is
// generated yet. Three outcomes: an entry with no pool ADOPTS the incoming declaration, agreeing pools do
// nothing, and two differing declarations latch a conflict for the resolver to raise.
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
		// Absence is not an opinion: the declared pool wins over the pool-less site that was seen first.
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

// declaredSamples reads a params map's `mockSamples` as a string slice; the second result is false unless the
// declaration is non-empty, the only case worth comparing.
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

// sameSamples compares ORDER-SENSITIVELY: the mock generator indexes into the order, so a reorder produces
// different values for the same seed.
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
