package runtype

import (
	"maps"
	"path"
	"slices"
	"sort"
	"strconv"
	"strings"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/hashid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/jsonsize"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// bundleKeyLength sizes the bundle's content-hash key: it only has to be unique within one runtime registry,
// and it changes whenever the row set does, so 10 dictionary chars is plenty.
const bundleKeyLength = 10

// RowHomes is where each runtype row is written: the one module reaching it, or the shared module of every row
// reached by the same set of modules, so a row ships once and a module imports only rows it reaches itself. A
// group too small to pay for a module is copied instead (copiedHome).
type RowHomes struct {
	home     map[string]string
	roots    map[string]bool
	closures map[string][]string
}

// PlanRowHomes plans the homes over a whole program; a planner fed one file would keep every row in that file.
// A row's owner set always contains its parent's, so shared modules import only larger sets and never cycle.
func PlanRowHomes(dump protocol.Dump, moduleOf func(protocol.Site) string) *RowHomes {
	nodes := indexNodes(dump.RunTypes)
	sitesByModule := groupReflectionSites(dump, moduleOf)
	homes := &RowHomes{home: map[string]string{}, roots: map[string]bool{}, closures: map[string][]string{}}
	owners := map[string][]string{}
	for _, module := range slices.Sorted(maps.Keys(sitesByModule)) {
		roots := reflectionRoots(sitesByModule[module])
		for _, root := range roots {
			homes.roots[root] = true
		}
		// Kept for the collector: a module's closure is the same in a one-file dump, which holds that file's types.
		homes.closures[module] = closureRows(roots, nodes)
		for _, id := range homes.closures[module] {
			owners[id] = append(owners[id], module)
		}
	}
	rowsBySet := map[string][]string{}
	ownerCount := map[string]int{}
	for id, modules := range owners {
		if len(modules) == 1 {
			homes.home[id] = modules[0]
			continue
		}
		set := strings.Join(modules, "\x00")
		rowsBySet[set] = append(rowsBySet[set], id)
		ownerCount[set] = len(modules)
	}
	for set, rows := range rowsBySet {
		if rowBytes(rows, nodes)*(ownerCount[set]-1) < sharedModuleBytes+sharedImportBytes*ownerCount[set] {
			for _, id := range rows {
				homes.home[id] = copiedHome
			}
			continue
		}
		sort.Strings(rows)
		shared := constants.RunTypesFileModuleDir + "/" + constants.RunTypesSharedModuleDir + "/" +
			hashid.QuickHash(strings.Join(rows, ","), sharedModuleHashLength)
		for _, id := range rows {
			homes.home[id] = shared
		}
	}
	return homes
}

// sharedModuleHashLength sizes a shared module's name, a hash of its row ids.
const sharedModuleHashLength = 10

// copiedHome marks a row group too small for a module of its own: each module referencing it writes a copy, which
// costs fewer bytes than the module wrapper plus one import line per owner (sharedModuleBytes, sharedImportBytes).
const (
	copiedHome        = "\x00copied"
	sharedModuleBytes = 48
	sharedImportBytes = 64
)

// rowBytes is the rendered size of rows, without a root size limit.
func rowBytes(rows []string, nodes map[string]*reflection.RunType) int {
	size := 0
	for _, id := range rows {
		size += len(strings.Join(renderFactoryArgs(nodes[id], 0), ",")) + 3
	}
	return size
}

// withCopies adds to rows the copied rows they or roots reach through other copied rows, never past a row with a
// module of its own; every one of them is in the closure of each module writing it, so a copy never leaks.
func (homes *RowHomes) withCopies(rows, roots []string, nodes map[string]*reflection.RunType) []string {
	seen := make(map[string]bool, len(rows))
	out := append([]string(nil), rows...)
	for _, id := range rows {
		seen[id] = true
	}
	var queue []string
	visit := func(id string) {
		if homes.home[id] == copiedHome && nodes[id] != nil && !seen[id] {
			seen[id] = true
			out = append(out, id)
			queue = append(queue, id)
		}
	}
	for _, root := range roots {
		visit(root)
	}
	for _, id := range rows {
		for _, child := range collectRefDeps(nodes[id]) {
			visit(child)
		}
	}
	for len(queue) > 0 {
		id := queue[len(queue)-1]
		queue = queue[:len(queue)-1]
		for _, child := range collectRefDeps(nodes[id]) {
			visit(child)
		}
	}
	sort.Strings(out)
	return out
}

// foreignHomes is the sorted set of modules other than self that hold rows of closure.
func (homes *RowHomes) foreignHomes(self string, closure []string) []string {
	seen := map[string]bool{}
	for _, id := range closure {
		if home := homes.home[id]; home != "" && home != copiedHome && home != self {
			seen[home] = true
		}
	}
	return slices.Sorted(maps.Keys(seen))
}

// directImports is the sorted set of modules other than self holding the roots or a child of rows; the runtime
// and the bundler follow each import's own imports for the rest.
func (homes *RowHomes) directImports(self string, rows, roots []string, nodes map[string]*reflection.RunType) []string {
	seen := map[string]bool{}
	add := func(id string) {
		if home := homes.home[id]; home != "" && home != copiedHome && home != self && nodes[id] != nil {
			seen[home] = true
		}
	}
	for _, root := range roots {
		add(root)
	}
	for _, id := range rows {
		for _, child := range collectRefDeps(nodes[id]) {
			add(child)
		}
	}
	return slices.Sorted(maps.Keys(seen))
}

// CollectEntries emits per module (nil moduleOf means one) a data entry of the rows it owns, importing the shared
// modules holding the rest of its closure, and a facade per root. Nil homes plans them from dump itself.
// The tuple key hashes the row ids and root size limits, so an evolved module re-registers after an HMR reload.
// jsonMaxBytes false leaves slot 21 off every root row, so a consumer not deriving request limits pays nothing.
func CollectEntries(dump protocol.Dump, jsonMaxBytes bool, moduleOf func(protocol.Site) string, homes *RowHomes) entrymodules.Graph {
	if homes == nil {
		homes = PlanRowHomes(dump, moduleOf)
	}
	graph := entrymodules.Graph{}
	nodes := indexNodes(dump.RunTypes)
	// A row is written once, so it carries its size limit when it is a root anywhere in the program.
	rootJSONMax := rootJSONMaxBytes(slices.Sorted(maps.Keys(homes.roots)), nodes, jsonMaxBytes)
	sitesByModule := groupReflectionSites(dump, moduleOf)
	emittedShared := map[string]bool{}
	// Sorted, so the graph is deterministic.
	for _, module := range slices.Sorted(maps.Keys(sitesByModule)) {
		collectModule(graph, module, sitesByModule[module], nodes, rootJSONMax, homes, emittedShared)
	}
	return graph
}

// groupReflectionSites buckets the reflection-only sites by the module their file maps to.
func groupReflectionSites(dump protocol.Dump, moduleOf func(protocol.Site) string) map[string][]protocol.Site {
	sitesByModule := map[string][]protocol.Site{}
	for _, site := range dump.Sites {
		// Circular createX types add no rows: their guard is a path skeleton baked into the armed factory.
		if site.ID == "" || site.FnId != "" {
			continue
		}
		module := constants.RunTypesBundleBasename
		if moduleOf != nil {
			module = moduleOf(site)
		}
		sitesByModule[module] = append(sitesByModule[module], site)
	}
	return sitesByModule
}

// collectModule adds one module's data entry and facades to graph, plus every shared module its closure reaches.
func collectModule(graph entrymodules.Graph, module string, sites []protocol.Site, nodes map[string]*reflection.RunType,
	rootJSONMax map[string]int, homes *RowHomes, emittedShared map[string]bool) {
	roots := reflectionRoots(sites)
	closure, planned := homes.closures[module]
	if !planned {
		closure = closureRows(roots, nodes)
	}
	rowsByHome := map[string][]string{}
	for _, id := range closure {
		rowsByHome[homes.home[id]] = append(rowsByHome[homes.home[id]], id)
	}
	// Every row of a shared module is in the closure of each module reaching it, so the slice is the whole module.
	for _, shared := range homes.foreignHomes(module, closure) {
		if emittedShared[shared] {
			continue
		}
		emittedShared[shared] = true
		rows := homes.withCopies(rowsByHome[shared], nil, nodes)
		addDataEntry(graph, shared, "rts_"+path.Base(shared), rows, nodes, rootJSONMax, homes.directImports(shared, rows, nil, nodes))
	}
	dataKey := module + moduleKeySeparator + dataEntryName
	// A root missing from the dump still gets a facade so the injected import resolves; the runtime sees a registry miss.
	var facadeDeps []string
	if len(closure) > 0 {
		rows := homes.withCopies(rowsByHome[module], roots, nodes)
		addDataEntry(graph, module, "", rows, nodes, rootJSONMax, homes.directImports(module, rows, roots, nodes))
		facadeDeps = []string{dataKey}
	}
	extraDeps := reflectionSiteDemandKeys(sites)
	for _, root := range roots {
		graph.Add(&entrymodules.Entry{
			Key:      module + moduleKeySeparator + root,
			Kind:     entrymodules.KindRunTypeFacade,
			Module:   module,
			Export:   root,
			ArgsText: quoteJS(root),
			Deps:     facadeDeps,
			SoftDeps: extraDeps[root],
		})
	}
}

// addDataEntry adds module's data entry holding rows, importing the data entries of the modules in imports.
// A file whose rows are all shared still gets one, with no rows, so each facade keeps a single data dep.
func addDataEntry(graph entrymodules.Graph, module, export string, rows []string, nodes map[string]*reflection.RunType,
	rootJSONMax map[string]int, imports []string) {
	sort.Strings(rows)
	indexOf := make(map[string]int, len(rows))
	for i, id := range rows {
		indexOf[id] = i
	}
	var rowsText strings.Builder
	var footer strings.Builder
	relRows := make([]string, len(rows))
	keyParts := make([]string, len(rows))
	for i, id := range rows {
		if i > 0 {
			// One row per line: newlines in an array literal are inert, and the tuple key hashes the ids, not this text.
			rowsText.WriteString(",\n")
		}
		rowsText.WriteByte('[')
		rowsText.WriteString(strings.Join(renderFactoryArgs(nodes[id], rootJSONMax[id]), ","))
		rowsText.WriteByte(']')
		// Refs ride the parallel `rels` array as row indices, or as ids for a row another module holds; only
		// expression-specials need the footer, so ini is mostly a hole.
		relRows[i] = renderRelations(nodes[id], indexOf)
		if hasBundleSpecials(nodes[id]) {
			writeBundleSpecials(&footer, nodes[id])
		}
		keyParts[i] = id
		if max, bounded := rootJSONMax[id]; bounded {
			keyParts[i] += ":" + strconv.Itoa(max)
		}
	}
	// Trailing leaf rows carry no relations: trimmed, the runtime's `rels[i]` read returns undefined for them.
	relEnd := len(relRows)
	for relEnd > 0 && relRows[relEnd-1] == "" {
		relEnd--
	}
	deps := make([]string, len(imports))
	for i, imported := range imports {
		deps[i] = imported + moduleKeySeparator + dataEntryName
	}
	// The imports join the key: the runtime skips a key it has seen, so two files owning no rows of their own
	// must still differ by the shared modules they load.
	tupleKey := "rts_" + hashid.QuickHash(strings.Join(keyParts, ",")+">"+strings.Join(imports, ","), bundleKeyLength)
	graph.Add(&entrymodules.Entry{
		Key:      module + moduleKeySeparator + dataEntryName,
		Kind:     entrymodules.KindRunTypeBundle,
		Module:   module,
		Export:   export,
		ArgsText: quoteJS(tupleKey) + ",[" + rowsText.String() + "],[" + strings.Join(relRows[:relEnd], ",") + "]",
		InitBody: footer.String(),
		Deps:     deps,
	})
}

// moduleKeySeparator joins a module to an entry name in a graph key; no module path or type id contains it.
const moduleKeySeparator = "#"

const dataEntryName = "rts"

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
