package runtype

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// bundleKeyLength sizes the bundle's content-hash key. The key only has to be
// unique within one runtime registry (vs every other entry key), and it
// changes whenever the row set changes — 10 dictionary chars is plenty.
const bundleKeyLength = 10

// CollectEntries builds the runtype side of the entry-module graph: ONE data
// bundle (`rtmod:/runtypes.js`) carrying every reflection-demanded node
// as a headless tuple row with a single combined footer initializer, plus one
// facade module per reflection ROOT (`rtmod:/<rootId>.js` — the module
// the rewrite's binding-only injection already imports at getRunTypeId /
// builder / mock sites). Function-family modules never
// import runtype modules, so the runtype graph is self-contained: the bundle
// imports nothing and each facade imports only the bundle. Every node row
// exists exactly once app-wide — no duplication across roots.
//
// Demand-driven: a dump with no reflection sites emits NO runtype modules
// (createX-only files pay zero reflection payload). Rows are the closure of
// every root over the ref-bearing slots (collectRefDeps), ordered
// alphabetically by id. The bundle's tuple KEY is a content hash over the row
// ids — ids embed shape and binary version, so the key changes exactly when
// the bundle content does and the runtime's processed-keys guard re-registers
// an evolved bundle after an HMR reload (the module NAME stays fixed; the
// Vite plugin invalidates it on addedRunTypes).
func CollectEntries(dump protocol.Dump) entrymodules.Graph {
	graph := entrymodules.Graph{}
	nodes := indexNodes(dump.RunTypes)
	// Bundle rows are the reflection-only roots' graphs. Circular createX types
	// no longer contribute rows: the circular-reference guard became a
	// compile-time option that bakes a path skeleton into the armed factory, so
	// it needs no RunType graph at runtime (a plain cyclable type ships nothing).
	facadeRoots := reflectionRoots(dump.Sites)
	rowRoots := facadeRoots
	if len(rowRoots) == 0 {
		return graph
	}
	rows := closureRows(rowRoots, nodes)
	indexOf := make(map[string]int, len(rows))
	for i, id := range rows {
		indexOf[id] = i
	}

	var rowsText strings.Builder
	var footer strings.Builder
	relRows := make([]string, len(rows))
	for i, id := range rows {
		if i > 0 {
			// One row per line — the data array is otherwise a single
			// unreadable mega-line. Newlines in an array literal are inert,
			// and bundleKey hashes `rows` (the ids), not this text.
			rowsText.WriteString(",\n")
		}
		rowsText.WriteByte('[')
		rowsText.WriteString(strings.Join(renderFactoryArgs(nodes[id]), ","))
		rowsText.WriteByte(']')
		// Ref relations ride the parallel `rels` array as row INDICES (see
		// renderRelations); only expression-specials (classType / bigint /
		// symbol / formatAnnotation) land in the residual footer, so the ini
		// slot is a hole for the common object/array/union node.
		relRows[i] = renderRelations(nodes[id], indexOf)
		if hasBundleSpecials(nodes[id]) {
			writeBundleSpecials(&footer, nodes[id])
		}
	}
	// Trailing leaf rows carry no relations — trim them so the runtime's
	// `rels[i]` read returns undefined for those tail indices (a no-op wire).
	relEnd := len(relRows)
	for relEnd > 0 && relRows[relEnd-1] == "" {
		relEnd--
	}
	bundleKey := "rts_" + hashid.QuickHash(strings.Join(rows, ","), bundleKeyLength)
	graph.Add(&entrymodules.Entry{
		Key:      bundleKey,
		Kind:     entrymodules.KindRunTypeBundle,
		ArgsText: quoteJS(bundleKey) + ",[" + rowsText.String() + "],[" + strings.Join(relRows[:relEnd], ",") + "]",
		InitBody: footer.String(),
	})
	// Facades are emitted for every reflection root — even one whose node never
	// made it into the dump (defensive): the injected import must resolve, and
	// the runtime degrades to a registry miss exactly as before.
	extraDeps := reflectionSiteDemandKeys(dump.Sites)
	for _, root := range facadeRoots {
		graph.Add(&entrymodules.Entry{
			Key:      root,
			Kind:     entrymodules.KindRunTypeFacade,
			ArgsText: quoteJS(root),
			Deps:     []string{bundleKey},
			SoftDeps: extraDeps[root],
		})
	}
	return graph
}

// reflectionSiteDemandKeys maps each reflection root id to the deduped, sorted
// cache-entry keys its sites demand BEYOND the runtype graph — today the fmt
// (formatTransform) entry a createMockDataFn-shaped site needs so generated
// mocks apply declared format transforms (see scan.go
// mockFormatTransformDemand). Riding the facade's SoftDeps loads those entries
// with the site's injected import; an entry the emitter dropped degrades to a
// KindMissing stub, so the import always resolves and the mock walker simply
// finds no transform — the pre-demand behavior.
func reflectionSiteDemandKeys(sites []protocol.Site) map[string][]string {
	byRoot := map[string]map[string]bool{}
	for _, site := range sites {
		if site.ID == "" || site.FnId != "" || len(site.Demand) == 0 {
			continue
		}
		for _, demand := range site.Demand {
			if demand.FnHash == "" {
				continue
			}
			if byRoot[site.ID] == nil {
				byRoot[site.ID] = map[string]bool{}
			}
			byRoot[site.ID][demand.FnHash+"_"+site.ID] = true
		}
	}
	if len(byRoot) == 0 {
		return nil
	}
	out := make(map[string][]string, len(byRoot))
	for id, keys := range byRoot {
		list := make([]string, 0, len(keys))
		for key := range keys {
			list = append(list, key)
		}
		sort.Strings(list)
		out[id] = list
	}
	return out
}

// indexNodes maps every dumped RunType by its id, skipping nil / id-less nodes.
func indexNodes(runTypes []*reflection.RunType) map[string]*reflection.RunType {
	nodes := make(map[string]*reflection.RunType, len(runTypes))
	for _, runType := range runTypes {
		if runType != nil && runType.ID != "" {
			nodes[runType.ID] = runType
		}
	}
	return nodes
}

// CollectEntriesPerNode is the allModules-mode collector: one entrymodules.Entry
// per cached RunType (the pre-bundle layout). Tuple args reuse
// renderFactoryArgs verbatim, the per-entry init body reuses writeFooter, and
// Deps collects the KindRef ids the footer references so the assembler
// imports each child's module. Every interned runtype gets an entry — demand
// scoping happens at the dump layer (scopedDump for scanFiles, full cache for
// dump). Measured slower than the bundle on dense reflection graphs (the
// reason the bundle replaced it) — kept as the allModules escape hatch.
func CollectEntriesPerNode(dump protocol.Dump) entrymodules.Graph {
	graph := make(entrymodules.Graph, len(dump.RunTypes))
	// Same extra-demand wiring as the bundle path: a mock-shaped reflection
	// site's fmt entries ride the root node's own module (the injected import
	// target in allModules mode) as SoftDeps.
	extraDeps := reflectionSiteDemandKeys(dump.Sites)
	for _, runType := range dump.RunTypes {
		if runType == nil || runType.ID == "" {
			continue
		}
		var footer strings.Builder
		// Per-node footers wire ref slots through `c('<id>')` registry lookups
		// (each child rides its own module dep), unlike the data bundle which
		// uses row indices.
		writeFooter(&footer, runType)
		graph.Add(&entrymodules.Entry{
			Key:      runType.ID,
			Kind:     entrymodules.KindRunType,
			ArgsText: strings.Join(renderFactoryArgs(runType), ","),
			InitBody: footer.String(),
			Deps:     collectRefDeps(runType),
			SoftDeps: extraDeps[runType.ID],
		})
	}
	return graph
}

// reflectionRoots returns the deduped, sorted ids of every reflection-only
// site — sites injecting the bare id (FnId empty), i.e. getRunTypeId /
// value-first builders / createMockDataFn. createX sites
// demand fn entries instead and never import runtype modules.
func reflectionRoots(sites []protocol.Site) []string {
	var roots []string
	seen := make(map[string]bool)
	for _, site := range sites {
		if site.ID == "" || site.FnId != "" || seen[site.ID] {
			continue
		}
		seen[site.ID] = true
		roots = append(roots, site.ID)
	}
	sort.Strings(roots)
	return roots
}

// closureRows walks the ref-bearing slots from every root over the dumped
// nodes and returns the reachable ids, sorted alphabetically (row order is
// registration order; footers only run after every row registered, so any
// deterministic order works). Refs to ids absent from the dump are skipped —
// the footer still references them and the runtime registry surfaces the
// miss, matching the pre-bundle behavior for un-dumped nodes.
func closureRows(roots []string, nodes map[string]*reflection.RunType) []string {
	visited := make(map[string]bool, len(nodes))
	queue := make([]string, 0, len(roots))
	for _, root := range roots {
		if nodes[root] != nil && !visited[root] {
			visited[root] = true
			queue = append(queue, root)
		}
	}
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		for _, dep := range collectRefDeps(nodes[id]) {
			if nodes[dep] != nil && !visited[dep] {
				visited[dep] = true
				queue = append(queue, dep)
			}
		}
	}
	rows := make([]string, 0, len(visited))
	for id := range visited {
		rows = append(rows, id)
	}
	sort.Strings(rows)
	return rows
}

// collectRefDeps gathers the distinct KindRef ids reachable from runType's
// ref-bearing slots — the same slots writeFooter patches (an inline non-ref
// child embeds as a JSON literal and contributes no row).
func collectRefDeps(runType *reflection.RunType) []string {
	var deps []string
	seen := make(map[string]bool)
	runType.EachRefSlot(func(child *reflection.RunType) {
		if child.Kind != reflection.KindRef || child.ID == "" || seen[child.ID] {
			return
		}
		seen[child.ID] = true
		deps = append(deps, child.ID)
	})
	return deps
}
