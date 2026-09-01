// Package entrymodules assembles the per-entry virtual ES modules emitted by the
// resolver: one module per cache entry (type-fn factory, JSON composite, pure
// fn), named `rtmod:/<basename>.js`, exporting a single positional tuple
// under its binding name (ExportName — `__rt_<basename>`, identifier-escaped).
// The SAME name binds the entry everywhere: the export, every importer's
// clause (`{__rt_X}`, never renamed), and the call-site binding the rewrite
// injects — one naming system across per-entry modules and bundles. Runtype
// nodes are denser than fn entries (one tiny row per node, heavily shared),
// so they ship as ROWS of THE single data-bundle module
// (`rtmod:/runtypes.js`, KindRunTypeBundle) aliased by one facade module
// per reflection root (KindRunTypeFacade) — see
// internal/cachegen/runtype.CollectEntries.
//
// Module shape (every kind):
//
//	import {__rt_<dep1>} from 'rtmod:/<dep1>.js';   // DIRECT deps only
//	…
//	function ini(rtu){const c=(id)=>rtu.useRunType(id);<footer>}  // runtype only
//	export const __rt_<basename>=[<kindSlot>,<()=>[__rt_<dep1>,…]|hole>,<ini|hole>,<positional args…>];
//
// The deps thunk is inlined straight into slot 1 (lazy: import cycles never
// hit TDZ); absent head slots (deps/ini) are JS array HOLES (the `,,` run),
// which read back as undefined under the runtime's index-only tuple access.
//
// Tuple layout is fixed at the head: slot 0 is the kind discriminator (0 =
// runtype, 2 = pure fn, 3 = missing stub, or the QUOTED family tag string for
// type-fn entries), slot 1 the deps thunk (a hole for dep-less entries — the
// thunk never includes self, every consumer already holds the tuple), slot 2
// the initEntry fn (or a hole),
// slot 3+ the same positional args the per-family `init(…)` / `rt(…)` /
// `factory(…)` calls passed before the migration (slot 3 is always the cache
// key). The JS-side `initFromTuple` consumer walks the deps() thunks
// RECURSIVELY (post-order, visited-set guarded) and registers in two phases:
// register every unseen tuple in the closure (children before parents), then
// run each newly-registered tuple's `ini`.
//
// Imports and deps() carry the DIRECT dependencies only — never the flattened
// transitive closure. ESM loads the closure transitively through the dep
// modules' own imports, and the runtime recursion re-walks the same edges, so
// flattening bought nothing but O(closure) text per module (quadratic over a
// dense graph — measured 6x wire payload and 2-4x render time on the real
// suites before this was fixed).
//
// Ordering invariant: a module's import block and deps() entries are
// LEAVES-FIRST by dependency level (level 0 = no deps), alphabetical by key
// within a level; self never appears. Cycles are collapsed to one level via
// Tarjan SCC (members ordered alphabetically), which keeps the output
// deterministic — cycle members only reference each other through
// `ini`/registry lookups that run after the whole registration phase, so
// intra-SCC order is correctness-neutral.
package entrymodules

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsquote"
)

// Kind discriminates the tuple layout of one entry module.
type Kind int

const (
	// KindRunType — a runTypes reflection-cache node (tuple slot 0 = 0).
	KindRunType Kind = 0
	// KindTypeFn — a type-fn factory entry; slot 0 carries the QUOTED family
	// tag (e.g. 'val', 'jeCL') instead of a number so the runtime can pick the
	// per-family entry metadata (fnID / args / noop identity) without a hash
	// reverse-lookup.
	KindTypeFn Kind = 1
	// KindPureFn — a pure-function entry (tuple slot 0 = 2).
	KindPureFn Kind = 2
	// KindMissing — a stub for a demanded key whose entry was dropped
	// (unsupported kind, dangling-dep cascade). The module resolves so the
	// injected import never breaks the build; the runtime treats the tuple as
	// "no factory" and falls back to the family identity fn, preserving the
	// pre-migration silent-degrade semantics (tuple slot 0 = 3).
	KindMissing Kind = 3
	// KindRunTypeBundle — THE single runtype data module
	// (`rtmod:/runtypes.js`): slot 3 carries a content-hash key, slot 4 an
	// array of headless runtype rows (one per reflection-demanded node,
	// deduplicated app-wide), slot 2 the ONE combined footer initializer. The
	// content-hash key (not the fixed module name) is what the runtime's
	// processed-keys guard sees, so an evolved bundle re-registers its new
	// rows (tuple slot 0 = 4).
	KindRunTypeBundle Kind = 4
	// KindRunTypeFacade — the per-reflection-root alias module
	// (`rtmod:/<rootId>.js`). Imports the bundle and registers nothing;
	// it exists so the rewrite's binding-only injection keeps working — the
	// root id rides in the key slot and the bundle rides the deps thunk
	// (tuple slot 0 = 5).
	KindRunTypeFacade Kind = 5
)

// Entry is one compiled cache entry awaiting module assembly.
type Entry struct {
	// Key is the canonical cache key: bare typeId (runtype), <fnHash>_<typeId>
	// (type-fn / composite), or <ns>::<fn> (pure fn).
	Key string
	// Kind selects the tuple layout. KindTypeFn entries must set FamilyTag.
	Kind Kind
	// FamilyTag is the family tag emitted in tuple slot 0 for KindTypeFn
	// entries ('val', 'pj', 'jeCL', …). Empty for every other kind.
	FamilyTag string
	// ArgsText is the pre-joined positional argument text (slot 3 onward);
	// the first argument is always the quoted Key. Identical to the interior
	// of the pre-migration `init(…)` / `rt(…)` / `factory(…)` call. Empty for
	// KindMissing (the stub renders just the quoted key).
	ArgsText string
	// InitBody carries the runtype footer statements (ref patches, classType,
	// footer literals) — newline-terminated lines referencing `c(id)`. Empty
	// for non-runtype entries; empty InitBody renders a hole in the ini slot.
	InitBody string
	// Deps lists the HARD direct dependency keys: child runtype refs
	// (runtype) and same-family child factories (type-fn). A type-fn entry
	// whose hard dep is missing cascades out (its body calls `<dep>.fn(…)`
	// unconditionally). Self-references are ignored; duplicates are deduped
	// at render time.
	Deps []string
	// SoftDeps lists the SOFT direct dependency keys: cross-family edges
	// (`<valHash>_<member>` union-discriminator lookups), composite→primitive
	// references, and pure-fn deps. Soft deps are imported exactly like hard
	// deps (the module closure must load them), but a missing soft dep never
	// cascades — the emitted bodies guard those lookups (`x?.fn(…) ?? true`,
	// identity fallbacks), so absence degrades gracefully at runtime via a
	// KindMissing stub module instead of dropping the dependent entry.
	SoftDeps []string
	// IsNoop marks a KindTypeFn entry whose fn is the family identity (the
	// short-form tuple — runtime registers familyMeta's noop fn). Consumers
	// that reference an entry only to call its fn can elide the reference:
	// the JSON composite collector reads this to drop dead primitive
	// bindings. False for every other kind.
	IsNoop bool
}

// allDeps iterates entry's hard + soft deps (callers dedup via sortedDeps).
func (entry *Entry) allDeps() []string {
	if len(entry.SoftDeps) == 0 {
		return entry.Deps
	}
	out := make([]string, 0, len(entry.Deps)+len(entry.SoftDeps))
	out = append(out, entry.Deps...)
	out = append(out, entry.SoftDeps...)
	return out
}

// Graph is the full entry set of one render pass, keyed by Entry.Key.
type Graph map[string]*Entry

// Add inserts entry, replacing any previous entry with the same key.
func (graph Graph) Add(entry *Entry) {
	if entry == nil || entry.Key == "" {
		return
	}
	graph[entry.Key] = entry
}

// Merge folds every entry of other into graph (other wins on key clashes).
func (graph Graph) Merge(other Graph) {
	for key, entry := range other {
		graph[key] = entry
	}
}

// Cascade removes type-fn entries whose HARD deps are missing from the graph,
// iterating to fixpoint (dropping X can orphan Y). Mirrors the pre-migration
// dangling-dep cascade: an entry whose body calls `<dep>.fn(…)` for a dep that
// never rendered would throw at runtime — and in module form the import would
// not even resolve. Soft deps never cascade (their lookups are guarded in the
// emitted bodies); runtype and pure-fn entries never cascade either: runtype
// refs always resolve against the session cache (a miss is a renderer bug
// surfaced by Render), and a missing pure-fn dep degrades to a stub (the
// runtime registers pure fns at their own call sites; see resolver wiring).
// Returns the dropped keys, sorted.
func (graph Graph) Cascade() []string {
	var dropped []string
	for {
		removed := 0
		for key, entry := range graph {
			if entry.Kind != KindTypeFn {
				continue
			}
			for _, dep := range entry.Deps {
				if dep == key {
					continue
				}
				if target, ok := graph[dep]; !ok || target.Kind == KindMissing {
					delete(graph, key)
					dropped = append(dropped, key)
					removed++
					break
				}
			}
		}
		if removed == 0 {
			break
		}
	}
	sort.Strings(dropped)
	return dropped
}

// AddMissingStubs inserts a KindMissing stub for every key in demanded that has
// no surviving entry, plus every unresolved dep of surviving entries (soft
// cross-family / pure-fn edges whose target never rendered). Stubs make every
// emitted import specifier resolvable; the runtime skips them.
func (graph Graph) AddMissingStubs(demanded []string) {
	for _, key := range demanded {
		if key == "" {
			continue
		}
		if _, ok := graph[key]; !ok {
			graph.Add(&Entry{Key: key, Kind: KindMissing})
		}
	}
	var stubs []string
	for _, entry := range graph {
		for _, dep := range entry.allDeps() {
			if dep == "" || dep == entry.Key {
				continue
			}
			if _, ok := graph[dep]; !ok {
				stubs = append(stubs, dep)
			}
		}
	}
	for _, key := range stubs {
		graph.Add(&Entry{Key: key, Kind: KindMissing})
	}
}

// ModuleName returns the virtual-module basename for an entry key. Runtype and
// type-fn keys are short alphanumeric hashes (plus one underscore for fn keys)
// and pass through unchanged; pure-fn keys (`<ns>::<fn>`) are path-encoded as
// `pf/<ns>/<fn>` with non-safe bytes escaped, so the basename is a valid (and
// readable) module specifier segment.
func ModuleName(key string, kind Kind) string {
	if kind == KindRunTypeBundle {
		return constants.RunTypesBundleBasename
	}
	if kind != KindPureFn {
		return key
	}
	namespace, fnName := key, ""
	if idx := strings.Index(key, "::"); idx >= 0 {
		namespace, fnName = key[:idx], key[idx+2:]
	}
	return constants.PureFnModuleDir + "/" + escapeModuleSegment(namespace) + "/" + escapeModuleSegment(fnName)
}

// escapeModuleSegment keeps [A-Za-z0-9_.-] bytes and hex-escapes everything
// else as `$XX`, so arbitrary namespace / fn names produce collision-free,
// URL-safe path segments ('$' itself is escaped).
func escapeModuleSegment(segment string) string {
	var builder strings.Builder
	for i := 0; i < len(segment); i++ {
		ch := segment[i]
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9',
			ch == '_', ch == '.', ch == '-':
			builder.WriteByte(ch)
		default:
			fmt.Fprintf(&builder, "$%02X", ch)
		}
	}
	return builder.String()
}

// BindingName derives the renamed-import identifier for a module basename:
// `<EntryBindingPrefix><basename>` with every non-identifier byte hex-escaped
// as `$XX` ('$' is a legal JS identifier char; literal '$' never survives
// module escaping un-escaped, so the mapping stays collision-free). Hash-keyed
// basenames pass through untouched; pure-fn basenames escape their '/', '.'
// and '-' separators.
func BindingName(basename string) string {
	var builder strings.Builder
	builder.WriteString(constants.EntryBindingPrefix)
	for i := 0; i < len(basename); i++ {
		ch := basename[i]
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9',
			ch == '_', ch == '$':
			builder.WriteByte(ch)
		default:
			fmt.Fprintf(&builder, "$%02X", ch)
		}
	}
	return builder.String()
}

// ImportSpecifier builds the full virtual-module specifier for a basename —
// `rtmod:/<basename>.js`.
func ImportSpecifier(basename string) string {
	return constants.EntryModulePrefix + basename + constants.EntryModuleSuffix
}

// Grouping assigns an entry to a bundle module: a non-empty return is the
// bundle BASENAME the entry rides in (as a named export under
// ExportName(entry)); empty means the entry gets its own per-entry module.
// nil Grouping == everything per-entry (default module mode).
type Grouping func(*Entry) string

// ExportName is the named-export identifier a bundled entry exports under —
// BindingName over the entry's per-entry basename, so the identifier the
// rewrite splices at call sites (`__rt_<basename>`) IS the export name and
// bundle imports never rename.
func ExportName(entry *Entry) string {
	return BindingName(ModuleName(entry.Key, entry.Kind))
}

// RenderGrouped assembles the graph's modules under a grouping: entries the
// grouping maps to the same bundle basename render into ONE module (each as a
// named export), everything else renders per-entry exactly as Render. Bundle
// members reference same-bundle deps as direct const identifiers; deps living
// elsewhere arrive as named imports of their export name — same clause shape
// whether the dep is a per-entry module or another bundle.
func RenderGrouped(graph Graph, grouping Grouping) (map[string]string, error) {
	keys := make([]string, 0, len(graph))
	for key := range graph {
		keys = append(keys, key)
	}
	sort.Strings(keys)

	order := levelOrder(graph, keys)

	groupOf := make(map[string]string, len(graph))
	bundles := make(map[string][]string)
	if grouping != nil {
		for _, key := range keys {
			if bundle := grouping(graph[key]); bundle != "" {
				groupOf[key] = bundle
				bundles[bundle] = append(bundles[bundle], key)
			}
		}
	}

	out := make(map[string]string, len(graph))
	for _, key := range keys {
		if groupOf[key] != "" {
			continue
		}
		entry := graph[key]
		source, err := renderModule(graph, entry, order, groupOf)
		if err != nil {
			return nil, err
		}
		out[ModuleName(entry.Key, entry.Kind)] = source
	}
	bundleNames := make([]string, 0, len(bundles))
	for name := range bundles {
		bundleNames = append(bundleNames, name)
	}
	sort.Strings(bundleNames)
	for _, name := range bundleNames {
		source, err := renderBundle(graph, name, bundles[name], order, groupOf)
		if err != nil {
			return nil, err
		}
		out[name] = source
	}
	return out, nil
}

// levels carries the global ordering metadata: each key's dependency level
// (leaves = 0; SCC members share a level) used to sort every module's imports
// and deps() thunk.
type levels map[string]int

// levelOrder computes per-key dependency levels over the whole graph: Tarjan
// SCC condensation first (cycles collapse to one node), then
// level(scc) = 1 + max(level(dep sccs)), leaves at 0.
func levelOrder(graph Graph, keys []string) levels {
	// Tarjan SCC, iterative-friendly sizes here (entry graphs are small);
	// recursion depth equals the longest dep chain, matching the existing
	// renderer's DFS topo sort.
	index := 0
	indices := make(map[string]int, len(graph))
	low := make(map[string]int, len(graph))
	onStack := make(map[string]bool, len(graph))
	var stack []string
	sccOf := make(map[string]int, len(graph))
	sccCount := 0

	var strongConnect func(key string)
	strongConnect = func(key string) {
		indices[key] = index
		low[key] = index
		index++
		stack = append(stack, key)
		onStack[key] = true
		entry := graph[key]
		for _, dep := range sortedDeps(entry) {
			if dep == key {
				continue
			}
			if _, ok := graph[dep]; !ok {
				continue // surfaced as an error in renderModule
			}
			if _, seen := indices[dep]; !seen {
				strongConnect(dep)
				if low[dep] < low[key] {
					low[key] = low[dep]
				}
			} else if onStack[dep] && indices[dep] < low[key] {
				low[key] = indices[dep]
			}
		}
		if low[key] == indices[key] {
			for {
				top := stack[len(stack)-1]
				stack = stack[:len(stack)-1]
				onStack[top] = false
				sccOf[top] = sccCount
				if top == key {
					break
				}
			}
			sccCount++
		}
	}
	for _, key := range keys {
		if _, seen := indices[key]; !seen {
			strongConnect(key)
		}
	}

	// Condensed-DAG levels, memoized. Tarjan emits SCCs in reverse
	// topological order, so a node's dep SCCs always have smaller… not
	// guaranteed across roots — use explicit memoized recursion instead.
	sccLevel := make([]int, sccCount)
	for i := range sccLevel {
		sccLevel[i] = -1
	}
	members := make([][]string, sccCount)
	for key, scc := range sccOf {
		members[scc] = append(members[scc], key)
	}
	var levelOf func(scc int) int
	levelOf = func(scc int) int {
		if sccLevel[scc] >= 0 {
			return sccLevel[scc]
		}
		sccLevel[scc] = 0 // breaks would-be recursion; real cycles are intra-SCC
		max := -1
		for _, key := range members[scc] {
			for _, dep := range graph[key].allDeps() {
				target, ok := graph[dep]
				if !ok || dep == key {
					continue
				}
				depSCC := sccOf[target.Key]
				if depSCC == scc {
					continue
				}
				if depLevel := levelOf(depSCC); depLevel > max {
					max = depLevel
				}
			}
		}
		sccLevel[scc] = max + 1
		return sccLevel[scc]
	}

	out := make(levels, len(graph))
	for key, scc := range sccOf {
		out[key] = levelOf(scc)
	}
	return out
}

// sortedDeps returns entry's hard + soft deps deduped and alphabetically
// sorted (self excluded) — the deterministic edge order every walk in this
// package uses. Hard/soft only differ for the cascade; ordering, closure and
// imports treat them uniformly.
func sortedDeps(entry *Entry) []string {
	if entry == nil {
		return nil
	}
	all := entry.allDeps()
	if len(all) == 0 {
		return nil
	}
	seen := make(map[string]bool, len(all))
	out := make([]string, 0, len(all))
	for _, dep := range all {
		if dep == "" || dep == entry.Key || seen[dep] {
			continue
		}
		seen[dep] = true
		out = append(out, dep)
	}
	sort.Strings(out)
	return out
}

// directDeps returns entry's direct deps (self excluded, deduped), sorted
// leaves-first by level then alphabetically — the exact order both the import
// block and the deps() thunk emit. A dep with no graph entry is a programmer
// error (the cascade/stub passes guarantee resolvability before Render).
func directDeps(graph Graph, entry *Entry, order levels) ([]string, error) {
	deps := sortedDeps(entry)
	for _, dep := range deps {
		if graph[dep] == nil {
			return nil, fmt.Errorf("entrymod: entry %q references missing dep %q (cascade/stub pass skipped?)", entry.Key, dep)
		}
	}
	sort.SliceStable(deps, func(i, j int) bool {
		if order[deps[i]] != order[deps[j]] {
			return order[deps[i]] < order[deps[j]]
		}
		return deps[i] < deps[j]
	})
	return deps, nil
}

// depBinding resolves the identifier a module references for one dep, writing
// the matching import line into imports (deduped per identifier): every entry
// is bound by its export name everywhere (`{__rt_X}`, no rename) — only the
// specifier differs (the dep's bundle when grouped, its own module otherwise).
// Same-bundle deps (selfBundle non-empty) reference the sibling const
// directly with no import at all.
func depBinding(graph Graph, depKey string, selfBundle string, groupOf map[string]string, imports *strings.Builder, imported map[string]bool) string {
	target := graph[depKey]
	bundle := groupOf[depKey]
	name := ExportName(target)
	if bundle != "" && bundle == selfBundle {
		return name
	}
	specifier := ImportSpecifier(ModuleName(target.Key, target.Kind))
	if bundle != "" {
		specifier = ImportSpecifier(bundle)
	}
	if !imported[name] {
		imported[name] = true
		imports.WriteString("import {" + name + "} from " + jsquote.Single(specifier) + ";\n")
	}
	return name
}

// renderModule emits one entry's module source.
func renderModule(graph Graph, entry *Entry, order levels, groupOf map[string]string) (string, error) {
	var body strings.Builder

	// Missing stubs: no imports, no deps thunk, no args — just the key. The
	// deps/ini head slots are JS array holes (the `,,` run).
	if entry.Kind == KindMissing {
		body.WriteString("export const " + ExportName(entry) + "=[" +
			strconv.Itoa(int(KindMissing)) + ",,," + jsquote.Single(entry.Key) + "];\n")
		return body.String(), nil
	}

	deps, err := directDeps(graph, entry, order)
	if err != nil {
		return "", err
	}

	// Import block — the direct deps, in (level, alpha) order, each imported
	// by its export name (no rename).
	var imports strings.Builder
	imported := make(map[string]bool)
	bindings := make([]string, len(deps))
	for i, key := range deps {
		bindings[i] = depBinding(graph, key, "", groupOf, &imports, imported)
	}
	body.WriteString(imports.String())

	// deps() thunk — direct deps in import order, never self (every consumer
	// of the tuple already holds it), inlined straight into the tuple slot.
	// Dep-less entries leave the slot a JS array hole.
	depsSlot := ""
	if len(bindings) > 0 {
		depsSlot = "()=>[" + strings.Join(bindings, ",") + "]"
	}

	// initEntry — runtype footer scoped to this entry; `c` resolves through
	// the registry so patched slots hold the materialized singletons, never
	// raw tuples (imported bindings are only touched inside deps()). Absent
	// for non-runtype entries — the slot is then a hole.
	iniSlot := ""
	if entry.InitBody != "" {
		body.WriteString("function ini(rtu){const c=(id)=>rtu.useRunType(id);\n")
		body.WriteString(entry.InitBody)
		if !strings.HasSuffix(entry.InitBody, "\n") {
			body.WriteByte('\n')
		}
		body.WriteString("}\n")
		iniSlot = "ini"
	}

	slot0, err := kindSlot(entry)
	if err != nil {
		return "", err
	}
	body.WriteString("export const " + ExportName(entry) + "=[" + slot0 + "," + depsSlot + "," + iniSlot)
	if entry.ArgsText != "" {
		body.WriteByte(',')
		body.WriteString(entry.ArgsText)
	}
	body.WriteString("];\n")
	return body.String(), nil
}

// facadeHoistMin is the number of folded facades (allSingle mode) above which
// their identical `()=>[__rt_runtypes]` deps thunk is hoisted into one shared
// `const rtL=…` local and reused — below it the declaration costs more than it
// saves (break-even ≈ 2.6). Mirrors the footer's hoistMinRefs.
const facadeHoistMin = 3

// facadeThunkLocal is the name of that shared thunk local.
const facadeThunkLocal = "rtL"

// renderBundle emits ONE module carrying every member entry as a named
// export. Same module shape per member as renderModule's tuple, but the deps
// thunk inlines into the tuple (no shared `deps` identifier to collide on),
// same-bundle deps are direct const references, and per-member ini fns are
// index-suffixed. Members render leaves-first (level, alpha) so the source
// reads in dependency order; correctness doesn't depend on it (thunks are
// lazy, inis run post-registration).
func renderBundle(graph Graph, name string, memberKeys []string, order levels, groupOf map[string]string) (string, error) {
	members := append([]string(nil), memberKeys...)
	sort.SliceStable(members, func(i, j int) bool {
		if order[members[i]] != order[members[j]] {
			return order[members[i]] < order[members[j]]
		}
		return members[i] < members[j]
	})

	// allSingle folds every reflection-root facade into this bundle; they all
	// carry the same `()=>[<bundle>]` deps thunk, so hoist it once when there
	// are enough to pay for the declaration (see facadeHoistMin).
	facadeCount := 0
	for _, key := range members {
		if graph[key].Kind == KindRunTypeFacade {
			facadeCount++
		}
	}
	hoistFacadeThunk := facadeCount >= facadeHoistMin
	facadeThunkEmitted := false

	var imports strings.Builder
	var body strings.Builder
	imported := make(map[string]bool)
	for memberIndex, key := range members {
		entry := graph[key]
		exportName := ExportName(entry)
		if entry.Kind == KindMissing {
			body.WriteString("export const " + exportName + "=[" +
				strconv.Itoa(int(KindMissing)) + ",,," + jsquote.Single(entry.Key) + "];\n")
			continue
		}
		deps, err := directDeps(graph, entry, order)
		if err != nil {
			return "", err
		}
		bindings := make([]string, len(deps))
		for i, dep := range deps {
			bindings[i] = depBinding(graph, dep, name, groupOf, &imports, imported)
		}
		iniSlot := ""
		if entry.InitBody != "" {
			iniName := "ini" + strconv.Itoa(memberIndex)
			body.WriteString("function " + iniName + "(rtu){const c=(id)=>rtu.useRunType(id);\n")
			body.WriteString(entry.InitBody)
			if !strings.HasSuffix(entry.InitBody, "\n") {
				body.WriteByte('\n')
			}
			body.WriteString("}\n")
			iniSlot = iniName
		}
		slot0, err := kindSlot(entry)
		if err != nil {
			return "", err
		}
		depsSlot := ""
		if len(bindings) > 0 {
			depsSlot = "()=>[" + strings.Join(bindings, ",") + "]"
		}
		// Fold every facade's identical bundle thunk onto one shared `rtL`
		// local, declared once before the first facade export (the kind-4 data
		// entry it references sorts first, so it is already declared above).
		if hoistFacadeThunk && entry.Kind == KindRunTypeFacade && depsSlot != "" {
			if !facadeThunkEmitted {
				body.WriteString("const " + facadeThunkLocal + "=" + depsSlot + ";\n")
				facadeThunkEmitted = true
			}
			depsSlot = facadeThunkLocal
		}
		body.WriteString("export const " + exportName + "=[" + slot0 + "," + depsSlot + "," + iniSlot)
		if entry.ArgsText != "" {
			body.WriteByte(',')
			body.WriteString(entry.ArgsText)
		}
		body.WriteString("];\n")
	}
	return imports.String() + body.String(), nil
}

// kindSlot renders tuple slot 0: the numeric kind, or the quoted family tag
// for type-fn entries.
func kindSlot(entry *Entry) (string, error) {
	switch entry.Kind {
	case KindRunType:
		return strconv.Itoa(int(KindRunType)), nil
	case KindPureFn:
		return strconv.Itoa(int(KindPureFn)), nil
	case KindRunTypeBundle:
		return strconv.Itoa(int(KindRunTypeBundle)), nil
	case KindRunTypeFacade:
		return strconv.Itoa(int(KindRunTypeFacade)), nil
	case KindTypeFn:
		if entry.FamilyTag == "" {
			return "", fmt.Errorf("entrymod: type-fn entry %q has no FamilyTag", entry.Key)
		}
		return jsquote.Single(entry.FamilyTag), nil
	}
	return "", fmt.Errorf("entrymod: entry %q has unsupported kind %d", entry.Key, entry.Kind)
}
