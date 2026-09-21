package runtype

import (
	"sort"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/jsonsize"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// bundleKeyLength sizes the bundle's content-hash key: it only has to be unique within one runtime registry,
// and it changes whenever the row set does, so 10 dictionary chars is plenty.
const bundleKeyLength = 10

// CollectEntries builds the runtype side of the entry-module graph: ONE data bundle (`rtmod:/runtypes.js`)
// carrying every reflection-demanded node as a headless tuple row with one combined footer, plus one facade
// module per reflection ROOT (`rtmod:/<rootId>.js`), which the rewrite's binding-only injection imports.
// The bundle imports nothing and a facade imports only the bundle, so the runtype graph is self-contained, and
// every node row exists exactly once app-wide. Demand-driven: a dump with no reflection sites emits NO runtype
// modules. Rows are the closure of every root over the ref-bearing slots, sorted by id.
// The bundle's tuple KEY is a content hash over the row ids, which embed shape and binary version, so it
// changes exactly when the content does and the runtime's processed-keys guard re-registers an evolved bundle
// after an HMR reload (the module NAME stays fixed; the Vite plugin invalidates it on addedRunTypes).
// jsonMaxBytes false leaves slot 21 off every root row, so a consumer not deriving request limits pays nothing.
func CollectEntries(dump protocol.Dump, jsonMaxBytes bool) entrymodules.Graph {
	graph := entrymodules.Graph{}
	nodes := indexNodes(dump.RunTypes)
	// Circular createX types contribute no rows: the circular-reference guard is a compile-time option that
	// bakes a path skeleton into the armed factory, so it needs no RunType graph at runtime.
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
	rootJSONMax := rootJSONMaxBytes(rowRoots, nodes, jsonMaxBytes)

	var rowsText strings.Builder
	var footer strings.Builder
	relRows := make([]string, len(rows))
	for i, id := range rows {
		if i > 0 {
			// One row per line: newlines in an array literal are inert, and bundleKey hashes the ids, not this text.
			rowsText.WriteString(",\n")
		}
		rowsText.WriteByte('[')
		rowsText.WriteString(strings.Join(renderFactoryArgs(nodes[id], rootJSONMax[id]), ","))
		rowsText.WriteByte(']')
		// Ref relations ride the parallel `rels` array as row INDICES (renderRelations); only expression-specials
		// land in the residual footer, so the ini slot is a hole for the common object/array/union node.
		relRows[i] = renderRelations(nodes[id], indexOf)
		if hasBundleSpecials(nodes[id]) {
			writeBundleSpecials(&footer, nodes[id])
		}
	}
	// Trailing leaf rows carry no relations: trimmed, the runtime's `rels[i]` read returns undefined for them.
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
	// A facade is emitted even for a root whose node never made it into the dump: the injected import must
	// resolve, and the runtime degrades to a registry miss.
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

// reflectionSiteDemandKeys maps each reflection root id to the deduped, sorted cache-entry keys its sites demand
// BEYOND the runtype graph: today the fmt (formatTransform) entry a createMockDataFn-shaped site needs so
// generated mocks apply declared format transforms (see scan.go mockFormatTransformDemand). They ride the
// facade's SoftDeps; an entry the emitter dropped degrades to a KindMissing stub, so the import still resolves
// and the mock walker simply finds no transform.
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

// CollectEntriesPerNode is the allModules-mode collector: one entrymodules.Entry per cached RunType, its Deps
// the KindRef ids the footer references so the assembler imports each child's module. Every interned runtype
// gets an entry, demand scoping happening at the dump layer. Measured slower than the bundle on dense
// reflection graphs, which is why the bundle replaced it; kept as the allModules escape hatch.
func CollectEntriesPerNode(dump protocol.Dump, jsonMaxBytes bool) entrymodules.Graph {
	graph := make(entrymodules.Graph, len(dump.RunTypes))
	// As on the bundle path, a mock-shaped site's fmt entries ride the root node's own module as SoftDeps.
	extraDeps := reflectionSiteDemandKeys(dump.Sites)
	rootJSONMax := rootJSONMaxBytes(reflectionRoots(dump.Sites), indexNodes(dump.RunTypes), jsonMaxBytes)
	for _, runType := range dump.RunTypes {
		if runType == nil || runType.ID == "" {
			continue
		}
		var footer strings.Builder
		// Per-node footers wire ref slots through `c('<id>')` registry lookups, each child riding its own module
		// dep, unlike the data bundle's row indices.
		writeFooter(&footer, runType)
		graph.Add(&entrymodules.Entry{
			Key:      runType.ID,
			Kind:     entrymodules.KindRunType,
			ArgsText: strings.Join(renderFactoryArgs(runType, rootJSONMax[runType.ID]), ","),
			InitBody: footer.String(),
			Deps:     collectRefDeps(runType),
			SoftDeps: extraDeps[runType.ID],
		})
	}
	return graph
}

// rootJSONMaxBytes computes the compact-JSON maximum (cachegen/jsonsize) of every fully bounded reflection
// root, keyed by id. Only roots carry the number: mion reads it off the params / return roots it injects, and a
// nested row would only bloat every bundle. An unbounded root is absent, so its row renders the slot as a hole.
func rootJSONMaxBytes(roots []string, nodes map[string]*reflection.RunType, enabled bool) map[string]int {
	if !enabled {
		return nil
	}
	out := make(map[string]int, len(roots))
	for _, root := range roots {
		node := nodes[root]
		if node == nil {
			continue
		}
		if result := jsonsize.MaxBytes(node, nodes); result.Bounded {
			out[root] = result.Bytes
		}
	}
	return out
}

// reflectionRoots returns the deduped, sorted ids of every reflection-only site, one injecting the bare id
// (FnId empty): getRunTypeId / value-first builders / createMockDataFn. createX sites demand fn entries instead.
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

// closureRows walks the ref-bearing slots from every root and returns the reachable ids, sorted alphabetically:
// row order is registration order and footers run only after every row registered, so any deterministic order
// works. Refs to ids absent from the dump are skipped, the footer still referencing them and the runtime
// registry surfacing the miss.
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

// collectRefDeps gathers the distinct KindRef ids in runType's ref-bearing slots, the ones writeFooter patches;
// an inline non-ref child embeds as a JSON literal and contributes no row.
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
