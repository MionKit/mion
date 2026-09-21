// Package entrymodules assembles the per-entry virtual ES modules the resolver emits, `rtmod:/<basename>.js`,
// each exporting one positional tuple under its binding name. The SAME name binds an entry everywhere: the
// export, every importer's clause and the call-site binding the rewrite injects, so nothing is ever renamed.
// Runtype nodes are denser than fn entries (one tiny row per node, heavily shared), so they ship as ROWS of
// THE single data bundle (`rtmod:/runtypes.js`) aliased by one facade module per reflection root; see
// internal/cachegen/runtype.CollectEntries. The tuple head is fixed: slot 0 the kind discriminator (a QUOTED
// family tag for type-fn entries), slot 1 the deps thunk, inlined so an import cycle never hits TDZ, slot 2
// the initEntry fn, slot 3+ the positional args with the cache key always at slot 3; an absent head slot is
// a JS array HOLE, read back as undefined by the runtime's index-only access. Imports and deps() carry the
// DIRECT dependencies only: ESM loads the closure through the dep modules' own imports and the runtime
// recursion re-walks the same edges, so flattening bought only 6x wire payload and 2-4x render time.
// Ordering invariant: imports and deps() are LEAVES-FIRST by dependency level, alphabetical within a level,
// cycles collapsed to one level by Tarjan SCC, and self never appears; intra-SCC order is
// correctness-neutral because cycle members reference each other only through lookups that run after the
// whole registration phase.
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
	// KindTypeFn — a type-fn factory entry; slot 0 carries the QUOTED family tag instead of a number, so
	// the runtime picks the per-family entry metadata without a hash reverse-lookup.
	KindTypeFn Kind = 1
	// KindPureFn — a pure-function entry (tuple slot 0 = 2).
	KindPureFn Kind = 2
	// KindMissing — a stub for a demanded key whose entry was dropped. The module resolves so the injected
	// import never breaks the build, and the runtime falls back to the family identity fn (tuple slot 0 = 3).
	KindMissing Kind = 3
	// KindRunTypeBundle — THE single runtype data module: slot 3 a content-hash key, slot 4 the headless
	// runtype rows deduplicated app-wide, slot 2 the ONE combined footer initializer. The runtime's
	// processed-keys guard sees that content hash, not the fixed module name, so an evolved bundle
	// re-registers its new rows (tuple slot 0 = 4).
	KindRunTypeBundle Kind = 4
	// KindRunTypeFacade — the per-reflection-root alias module, registering nothing; it exists so the
	// rewrite's binding-only injection keeps working, the root id in the key slot and the bundle in the
	// deps thunk (tuple slot 0 = 5).
	KindRunTypeFacade Kind = 5
)

// Entry is one compiled cache entry awaiting module assembly.
type Entry struct {
	// Key is the canonical cache key: bare typeId, <fnHash>_<typeId> for a type-fn, <ns>::<fn> for a pure fn.
	Key string
	// Kind selects the tuple layout. KindTypeFn entries must set FamilyTag.
	Kind Kind
	// FamilyTag is emitted in tuple slot 0 for KindTypeFn entries; empty for every other kind.
	FamilyTag string
	// ArgsText is the pre-joined positional argument text from slot 3 on, always starting with the quoted
	// Key. Empty for KindMissing, whose stub renders just that key.
	ArgsText string
	// InitBody carries the runtype footer statements, newline-terminated lines referencing `c(id)`; empty
	// for a non-runtype entry, and an empty InitBody renders a hole in the ini slot.
	InitBody string
	// Deps lists the HARD direct dependency keys, child runtype refs and same-family child factories. A
	// type-fn entry whose hard dep is missing cascades out, its body calling `<dep>.fn(…)` unconditionally.
	// Self-references are ignored and duplicates deduped at render time.
	Deps []string
	// SoftDeps lists the SOFT direct dependency keys: cross-family edges, composite to primitive references
	// and pure-fn deps. They are imported like hard deps, the module closure must load them, but a missing
	// soft dep never cascades: the emitted bodies guard those lookups, so it degrades to a KindMissing stub.
	SoftDeps []string
	// IsNoop marks a KindTypeFn entry whose fn is the family identity, so a consumer that references it only
	// to call its fn can elide the reference; the JSON composite collector drops dead primitive bindings on
	// it. False for every other kind.
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

// Cascade removes type-fn entries whose HARD deps are missing, to fixpoint since dropping X can orphan Y:
// an entry calling `<dep>.fn(…)` for a dep that never rendered would not even resolve its import. Soft deps
// never cascade, their lookups being guarded in the emitted bodies, and neither do runtype entries (a
// missing ref is a renderer bug the render pass surfaces) or pure-fn ones (a missing dep degrades to a stub).
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

// AddMissingStubs stubs every demanded key with no surviving entry, plus every unresolved dep of a
// surviving one, so each emitted import specifier resolves; the runtime skips a stub.
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

// ModuleName is the virtual-module basename of an entry key. Runtype and type-fn keys are hashes and pass
// through; a pure fn's key is its id, path-encoded as `pf/<owner>/<hash>` with non-safe bytes escaped per
// segment (no owner half lands at `pf/<hash>`). The encoding is injective because the hash prefix and `/`
// are the only separators an id can hold and neither survives escaping inside a segment.
func ModuleName(key string, kind Kind) string {
	if kind == KindRunTypeBundle {
		return constants.RunTypesBundleBasename
	}
	// A missing stub keyed by a pure-fn id takes the pure-fn layout too: the raw id holds a `#`, which
	// a module URL reads as a fragment.
	if kind != KindPureFn && !(kind == KindMissing && strings.Contains(key, constants.PureFnHashPrefix)) {
		return key
	}
	location, name := key, ""
	if idx := strings.LastIndex(key, constants.PureFnHashPrefix); idx >= 0 {
		location, name = key[:idx], key[idx+len(constants.PureFnHashPrefix):]
	}
	segments := []string{constants.PureFnModuleDir}
	if location != "" {
		for _, part := range strings.Split(location, "/") {
			segments = append(segments, escapeModuleSegment(part))
		}
	}
	return strings.Join(append(segments, escapeModuleSegment(name)), "/")
}

// escapeModuleSegment hex-escapes as `$XX`, '$' itself included, so any path or fn name gives a
// collision-free, URL-safe segment. `@` is kept because a scoped package name is an id's first segment.
func escapeModuleSegment(segment string) string {
	var builder strings.Builder
	for i := 0; i < len(segment); i++ {
		ch := segment[i]
		switch {
		case ch >= 'a' && ch <= 'z', ch >= 'A' && ch <= 'Z', ch >= '0' && ch <= '9',
			ch == '_', ch == '.', ch == '-', ch == '@':
			builder.WriteByte(ch)
		default:
			fmt.Fprintf(&builder, "$%02X", ch)
		}
	}
	return builder.String()
}

// BindingName is the import identifier for a module basename, every non-identifier byte hex-escaped as
// `$XX`; a literal '$' never survives module escaping unescaped, so the mapping stays collision-free.
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

// ImportSpecifier builds the full virtual-module specifier, `rtmod:/<basename>.js`.
func ImportSpecifier(basename string) string {
	return constants.EntryModulePrefix + basename + constants.EntryModuleSuffix
}

// Grouping returns the bundle BASENAME an entry rides in as a named export, or empty for its own per-entry
// module; a nil Grouping means everything per-entry.
type Grouping func(*Entry) string

// ExportName is BindingName over the entry's per-entry basename, so the identifier the rewrite splices at
// call sites IS the export name and bundle imports never rename.
func ExportName(entry *Entry) string {
	return BindingName(ModuleName(entry.Key, entry.Kind))
}

// RenderGrouped renders entries sharing a bundle basename into ONE module, each a named export, and the
// rest per-entry. A bundle member references a same-bundle dep as a direct const and any other dep as a
// named import of its export name, the same clause shape for a per-entry module and for another bundle.
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

// levels is each key's dependency level (leaves 0, SCC members sharing one), the sort key of every
// module's imports and deps() thunk.
type levels map[string]int

// levelOrder condenses the graph with Tarjan SCC, cycles collapsing to one node, then levels it as
// level(scc) = 1 + max(level(dep sccs)), leaves at 0.
func levelOrder(graph Graph, keys []string) levels {
	// Recursion depth equals the longest dep chain, which entry graphs keep small.
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

	// Condensed-DAG levels by explicit memoized recursion: Tarjan's reverse topological emission does not
	// order SCCs across separate roots.
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

// sortedDeps is the deterministic edge order every walk in this package uses; hard and soft deps differ
// only for the cascade, ordering and imports treat them alike.
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

// directDeps sorts the deps leaves-first by level then alphabetically, the exact order the import block and
// the deps() thunk emit. A dep with no graph entry is a programmer error: the cascade and stub passes
// guarantee resolvability before rendering.
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

// depBinding writes the dep's import line into imports, deduped per identifier: an entry is bound by its
// export name everywhere and only the specifier differs, the dep's bundle when grouped and its own module
// otherwise. A same-bundle dep references the sibling const directly, with no import at all.
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

	// A missing stub carries just the key; its deps / ini head slots are JS array holes.
	if entry.Kind == KindMissing {
		body.WriteString("export const " + ExportName(entry) + "=[" +
			strconv.Itoa(int(KindMissing)) + ",,," + jsquote.Single(entry.Key) + "];\n")
		return body.String(), nil
	}

	deps, err := directDeps(graph, entry, order)
	if err != nil {
		return "", err
	}

	// The direct deps in (level, alpha) order, each imported by its export name, never renamed.
	var imports strings.Builder
	imported := make(map[string]bool)
	bindings := make([]string, len(deps))
	for i, key := range deps {
		bindings[i] = depBinding(graph, key, "", groupOf, &imports, imported)
	}
	body.WriteString(imports.String())

	// The deps thunk never includes self, every consumer of the tuple already holding it; a dep-less entry
	// leaves the slot a JS array hole.
	depsSlot := ""
	if len(bindings) > 0 {
		depsSlot = "()=>[" + strings.Join(bindings, ",") + "]"
	}

	// `c` resolves through the registry so patched slots hold the materialized singletons, never raw
	// tuples; imported bindings are touched only inside deps().
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

// facadeHoistMin is where hoisting the facades' identical deps thunk into one shared local starts paying
// for the declaration (break-even ≈ 2.6). Mirrors the footer's hoistMinRefs.
const facadeHoistMin = 3

// facadeThunkLocal is the name of that shared thunk local.
const facadeThunkLocal = "rtL"

// renderBundle emits ONE module carrying every member as a named export: the deps thunk inlines so no
// shared `deps` identifier can collide, same-bundle deps are direct const references and ini fns are
// index-suffixed. Members render leaves-first only for readability; thunks are lazy and inis run
// post-registration, so correctness does not depend on it.
func renderBundle(graph Graph, name string, memberKeys []string, order levels, groupOf map[string]string) (string, error) {
	members := append([]string(nil), memberKeys...)
	sort.SliceStable(members, func(i, j int) bool {
		if order[members[i]] != order[members[j]] {
			return order[members[i]] < order[members[j]]
		}
		return members[i] < members[j]
	})

	// Every folded reflection-root facade carries the same `()=>[<bundle>]` thunk, so hoist it once when
	// there are enough to pay for the declaration (see facadeHoistMin).
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
		// Declared once before the first facade export; the kind-4 data entry it references sorts first, so
		// it is already declared above.
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

// kindSlot renders tuple slot 0: the numeric kind, or the quoted family tag for a type-fn entry.
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
