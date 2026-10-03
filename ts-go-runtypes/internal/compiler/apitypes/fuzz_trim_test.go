package apitypes

import (
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"reflect"
	"sort"
	"strconv"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/runtype/typeid"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// The api-types fuzz lane: random declaration graphs, every type labelled at generation as reached from the API
// (KEEP_n_, must ship) or not (POISON_n_, must not, often importing heavy-pkg). Replay a seed with MION_FUZZ_SEED.
func TestFuzz_ApiTypesTrim(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	seed, origin, err := testfixtures.FuzzSeed("apitypes")
	if err != nil {
		t.Fatal(err)
	}
	t.Log(origin)
	iterations := 8
	if raw := os.Getenv("MION_FUZZ_ITER"); raw != "" {
		if iterations, err = strconv.Atoi(raw); err != nil {
			t.Fatalf("MION_FUZZ_ITER: %v", err)
		}
	}
	rng := rand.New(rand.NewSource(seed))
	for iteration := 0; iteration < iterations; iteration++ {
		caseSeed := rng.Int63()
		graph := generateApiGraph(rand.New(rand.NewSource(caseSeed)))
		if failures := runApiTypesCase(t, graph, caseSeed); len(failures) > 0 {
			t.Fatalf("iteration %d (case seed %d, replay with MION_FUZZ_SEED=%d):\n%s\n%s", iteration, caseSeed, seed, strings.Join(failures, "\n"), graph.dump())
		}
	}
}

// runApiTypesCase trims one generated graph and returns every oracle that failed.
func runApiTypesCase(t *testing.T, graph *apiGraph, caseSeed int64) []string {
	t.Helper()
	output, input, err := tryTrimIn(t, graph.files, graph.entry, heavyProject)
	if err != nil {
		return []string{"trim failed: " + err.Error()}
	}
	if problems := fullProgramProblems(input, graph.entry); len(problems) > 0 {
		t.Fatalf("generator bug, the untrimmed declarations do not type-check (case seed %d):\n%s\n\n%s", caseSeed, strings.Join(problems, "\n"), graph.dump())
	}
	var failures []string
	failures = append(failures, oracleNoLeak(output)...)
	failures = append(failures, oracleNoLoss(t, graph, input, output)...)
	again, err := Trim(Input{Cwd: input.Cwd, TsconfigPath: input.TsconfigPath, DeclarationDir: input.DeclarationDir, Declarations: absoluteFiles(input, output.Files), Entry: input.Entry})
	if err != nil {
		failures = append(failures, "re-trimming the output failed: "+err.Error())
	} else {
		failures = append(failures, oracleSameFiles("idempotent: trimming the output again", output.Files, again.Files)...)
	}
	twin := generateApiGraph(rand.New(rand.NewSource(caseSeed)))
	twinOutput, _, err := tryTrimIn(t, twin.files, twin.entry, heavyProject)
	if err != nil {
		failures = append(failures, "deterministic: the same seed failed to trim: "+err.Error())
	} else {
		failures = append(failures, oracleSameFiles("deterministic: the same seed", output.Files, twinOutput.Files)...)
	}
	if len(failures) > 0 {
		failures = append(failures, "\n// ======== trimmed ========\n"+(&apiGraph{files: output.Files}).dump(), "// ======== generated ========")
	}
	return failures
}

// oracleNoLeak: no poison name, no heavy-pkg, and no peer but the router.
func oracleNoLeak(output *Output) []string {
	var failures []string
	for _, rel := range sortedKeys(output.Files) {
		for _, leak := range []string{"POISON_", "heavy-pkg", "node:http"} {
			if strings.Contains(output.Files[rel], leak) {
				failures = append(failures, fmt.Sprintf("no leak: %s ships %q", rel, leak))
			}
		}
	}
	if strings.Join(output.Externals, ",") != "@mionjs/router" {
		failures = append(failures, fmt.Sprintf("no leak: peers %v, want only @mionjs/router", output.Externals))
	}
	return failures
}

// oracleNoLoss: the output type-checks alone with the same build version, every reached type ships, and the API
// type reads the same as before the trim.
func oracleNoLoss(t *testing.T, graph *apiGraph, input Input, output *Output) []string {
	t.Helper()
	problems, version, err := Check(input, output.Files, output.Entry)
	if err != nil {
		return []string{"no loss: check failed: " + err.Error()}
	}
	var failures []string
	for _, problem := range problems {
		failures = append(failures, "no loss: "+problem)
	}
	if len(problems) == 0 && version != output.BuildVersion {
		failures = append(failures, fmt.Sprintf("no loss: build version %q, want %q", version, output.BuildVersion))
	}
	published := strings.Join(mapValues(output.Files), "\n")
	for _, kept := range graph.keptNames() {
		if !strings.Contains(published, kept) {
			failures = append(failures, "no loss: reached type "+kept+" was dropped")
		}
	}
	if len(problems) == 0 {
		full := apiMemberIDs(t, input, input.Declarations, input.Entry)
		if trimmed := apiMemberIDs(t, input, absoluteFiles(input, output.Files), input.Entry); full != trimmed {
			failures = append(failures, fmt.Sprintf("no loss: the API's type ids changed\nfull:    %s\ntrimmed: %s", full, trimmed))
		}
	}
	return failures
}

// apiMemberIDs lists the structural type id of every API member, nested groups included: what a client compares.
func apiMemberIDs(t *testing.T, input Input, files map[string]string, entry string) string {
	t.Helper()
	trimmer, release, err := newTrimmer(input, files)
	if err != nil {
		t.Fatal(err)
	}
	defer release()
	computer := typeid.New(trimmer.checker)
	var lines []string
	var walk func(prefix string, apiType *checker.Type)
	walk = func(prefix string, apiType *checker.Type) {
		for _, property := range trimmer.checker.GetPropertiesOfType(apiType) {
			if strings.Contains(property.Name, "apiBuildVersion") {
				continue
			}
			propertyType := trimmer.checker.GetTypeOfSymbol(property)
			if strings.HasPrefix(trimmer.checker.TypeToString(propertyType), "PublicApi<") {
				walk(prefix+property.Name+".", propertyType)
				continue
			}
			lines = append(lines, prefix+property.Name+"="+computer.Compute(propertyType))
		}
	}
	moduleSymbol := trimmer.checker.GetSymbolAtLocation(trimmer.files[entry].source.AsNode())
	for _, exported := range trimmer.checker.GetExportsOfModule(moduleSymbol) {
		if exported.Name == "api" {
			walk("", trimmer.exportType(exported))
		}
	}
	sort.Strings(lines)
	return strings.Join(lines, " ")
}

func oracleSameFiles(label string, want, got map[string]string) []string {
	if reflect.DeepEqual(want, got) {
		return nil
	}
	var failures []string
	for _, rel := range sortedKeys(mergeKeys(want, got)) {
		if want[rel] != got[rel] {
			failures = append(failures, fmt.Sprintf("%s changed %s:\n--- first ---\n%s\n--- second ---\n%s", label, rel, want[rel], got[rel]))
		}
	}
	return failures
}

// fullProgramProblems type-checks the untrimmed declarations, the generator's own floor.
func fullProgramProblems(input Input, entry string) []string {
	files := map[string]string{}
	for abs, text := range input.Declarations {
		rel, _ := filepath.Rel(input.DeclarationDir, abs)
		files[filepath.ToSlash(rel)] = text
	}
	problems, _, err := Check(input, files, entry)
	if err != nil {
		return []string{err.Error()}
	}
	return problems
}

func absoluteFiles(input Input, files map[string]string) map[string]string {
	out := make(map[string]string, len(files))
	for rel, text := range files {
		out[filepath.Join(input.DeclarationDir, filepath.FromSlash(rel))] = text
	}
	return out
}

func sortedKeys(files map[string]string) []string {
	keys := make([]string, 0, len(files))
	for key := range files {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func mergeKeys(first, second map[string]string) map[string]string {
	out := map[string]string{}
	for key := range first {
		out[key] = ""
	}
	for key := range second {
		out[key] = ""
	}
	return out
}

// TestFuzz_ApiTypesGeneratorCoversEveryPosition: across a few hundred graphs the generator writes every place a
// type can be named, so a generator change cannot silently narrow the lane.
func TestFuzz_ApiTypesGeneratorCoversEveryPosition(t *testing.T) {
	positions := map[string]string{
		"property": "p", "index signature": "[key: string]: ", "array": "[];", "generic argument": "Array<",
		"generic default": "<T0 = ", "extends": " extends KEEP_", "implements": " implements ", "union": " | null",
		"function param and return": "(input: ", "conditional": " extends object ? ", "mapped": "[K in keyof ",
		"keyof": ": keyof ", "typeof": "typeof ", "import type": `import("./`, "namespace": "declare namespace ",
		"overload": "flag: boolean): string;", "merge": "merged", "declare module": "declare module 'heavy-pkg'",
		"declare global": "declare global {", "export *": "export * from", "named re-export": "export { ",
		"aliased import": "_as_", "namespace import": "import type * as ", "barrel import": "from './index.ts'",
		"public middleware": "MiddlewareDef<(ctx: unknown", "private middleware": "MiddlewareDef<(ctx?: ",
		"raw middleware": "RawMiddlewareDef<(", "expanded api": `import("@mionjs/router").PublicRoute<`,
		"route group": "{ m", "heavy import": "import type { HeavyDb } from 'heavy-pkg'", "heavy import type": `import("heavy-pkg")`,
	}
	seen := map[string]bool{}
	for seed := int64(0); seed < 300; seed++ {
		text := generateApiGraph(rand.New(rand.NewSource(seed))).dump()
		for name, marker := range positions {
			if strings.Contains(text, marker) {
				seen[name] = true
			}
		}
	}
	for name := range positions {
		if !seen[name] {
			t.Errorf("the generator never writes a %s", name)
		}
	}
}

// TestFuzz_ApiTypesOraclesFire is the negative control: each oracle fails on a deliberately broken output.
func TestFuzz_ApiTypesOraclesFire(t *testing.T) {
	graph := generateApiGraph(rand.New(rand.NewSource(7)))
	output, input, err := tryTrimIn(t, graph.files, graph.entry, heavyProject)
	if err != nil {
		t.Fatal(err)
	}
	if failures := append(oracleNoLeak(output), oracleNoLoss(t, graph, input, output)...); len(failures) > 0 {
		t.Fatalf("the control case must pass first:\n%s", strings.Join(failures, "\n"))
	}
	if len(graph.keptNames()) == 0 || len(graph.poisonNames()) == 0 {
		t.Fatalf("the control case needs both reached and unreached types:\n%s", graph.dump())
	}

	leaked := copyOutput(output)
	leaked.Files[output.Entry] += "export type " + graph.poisonNames()[0] + " = string;\n"
	if len(oracleNoLeak(leaked)) == 0 {
		t.Error("no leak must fire on a shipped poison type")
	}
	peer := copyOutput(output)
	peer.Externals = append(peer.Externals, "heavy-pkg")
	if len(oracleNoLeak(peer)) == 0 {
		t.Error("no leak must fire on a heavy-pkg peer")
	}

	lost := copyOutput(output)
	dropped := graph.keptNames()[0]
	for rel, text := range lost.Files {
		lost.Files[rel] = strings.ReplaceAll(text, dropped, "Gone")
	}
	if len(oracleNoLoss(t, graph, input, lost)) == 0 {
		t.Errorf("no loss must fire when %s is dropped", dropped)
	}

	// Still type-checks on its own, yet every string member is now a number: only the id comparison sees it.
	retyped := copyOutput(output)
	for rel, text := range retyped.Files {
		retyped.Files[rel] = strings.ReplaceAll(text, ": string;", ": number;")
	}
	if failures := oracleNoLoss(t, graph, input, retyped); len(failures) != 1 || !strings.Contains(failures[0], "type ids changed") {
		t.Errorf("no loss must fire on changed type ids alone, got %v", failures)
	}

	changed := copyOutput(output)
	changed.Files[output.Entry] += "export type Extra = 1;\n"
	if len(oracleSameFiles("probe", output.Files, changed.Files)) == 0 {
		t.Error("the idempotent and deterministic oracles must fire on a changed file")
	}
	delete(changed.Files, output.Entry)
	if len(oracleSameFiles("probe", output.Files, changed.Files)) == 0 {
		t.Error("the idempotent and deterministic oracles must fire on a missing file")
	}
}

func copyOutput(output *Output) *Output {
	out := *output
	out.Files = map[string]string{}
	for rel, text := range output.Files {
		out.Files[rel] = text
	}
	out.Externals = append([]string(nil), output.Externals...)
	return &out
}

// --- generator ---

type unitKind int

const (
	kindInterface unitKind = iota
	kindMergedInterface
	kindAlias
	kindClass
	kindConst
	kindFunction
	kindNamespace
	kindCount
)

// apiUnit is one named declaration (several statements for a merge or overloads), the unit labelled kept or poison.
type apiUnit struct {
	index    int
	file     int // 0 is the API file
	kind     unitKind
	refs     []*apiUnit
	reached  bool
	heavy    bool // a poison unit that also reads heavy-pkg
	global   bool // declared in a `declare global` block, read by its bare name
	generic  bool // has a type parameter whose default reads its first ref
	exported bool
	name     string
}

func (unit *apiUnit) isType() bool { return unit.kind != kindConst && unit.kind != kindFunction }

// routeSlot is one member of the routes: public (its types are reached) or private / raw (cut, never reached).
type routeSlot struct {
	name   string
	kind   string // route, middleware, private, raw
	params []*apiUnit
	group  bool
}

type apiGraph struct {
	units    []*apiUnit
	slots    []routeSlot
	others   [][]*apiUnit // other exports of the API file: functions and aliases only the server uses
	expanded bool         // the API type written expanded, as `mion compile` emits it for an annotated value
	libFiles int
	files    map[string]string
	entry    string
	// forms caches how a file names a unit of another file: named, aliased, namespace, barrel.
	forms map[[2]int]string
}

func generateApiGraph(rng *rand.Rand) *apiGraph {
	graph := &apiGraph{libFiles: 1 + rng.Intn(3), forms: map[[2]int]string{}, entry: "api.d.ts"}
	count := 5 + rng.Intn(10)
	for index := 0; index < count; index++ {
		unit := &apiUnit{index: index, file: rng.Intn(graph.libFiles + 1), kind: unitKind(rng.Intn(int(kindCount)))}
		if index > 0 {
			for refs := rng.Intn(4); refs > 0; refs-- {
				unit.refs = append(unit.refs, graph.units[rng.Intn(index)])
			}
		}
		// A global is a plain interface read by its bare name: a lib-file block, never the API file's.
		if unit.kind == kindInterface && unit.file > 0 && rng.Intn(4) == 0 {
			unit.global = true
		}
		unit.generic = len(unit.refs) > 0 && (unit.kind == kindInterface || unit.kind == kindAlias || unit.kind == kindClass) && !unit.global && rng.Intn(3) == 0
		graph.units = append(graph.units, unit)
	}
	pick := func() []*apiUnit {
		var out []*apiUnit
		for params := 1 + rng.Intn(2); params > 0; params-- {
			out = append(out, graph.units[rng.Intn(count)])
		}
		return out
	}
	graph.expanded = rng.Intn(3) == 0
	kinds := []string{"route", "route", "middleware", "private", "raw"}
	if graph.expanded {
		kinds = []string{"route", "route", "middleware"}
	}
	for slot := 1 + rng.Intn(5); slot > 0; slot-- {
		graph.slots = append(graph.slots, routeSlot{name: fmt.Sprintf("m%d", len(graph.slots)), kind: kinds[rng.Intn(len(kinds))], params: pick(), group: rng.Intn(4) == 0})
	}
	if graph.slots[0].kind == "private" || graph.slots[0].kind == "raw" {
		graph.slots[0].kind = "route"
	}
	for other := rng.Intn(3); other > 0; other-- {
		graph.others = append(graph.others, pick())
	}

	var mark func(unit *apiUnit)
	mark = func(unit *apiUnit) {
		if unit.reached {
			return
		}
		unit.reached = true
		for _, ref := range unit.refs {
			mark(ref)
		}
	}
	for _, slot := range graph.slots {
		if slot.kind == "route" || slot.kind == "middleware" {
			for _, param := range slot.params {
				mark(param)
			}
		}
	}
	for _, unit := range graph.units {
		if unit.reached {
			unit.name = fmt.Sprintf("KEEP_%d_", unit.index)
		} else {
			unit.name = fmt.Sprintf("POISON_%d_", unit.index)
			unit.heavy = rng.Intn(2) == 0
		}
		unit.exported = unit.file > 0 || rng.Intn(2) == 0
	}
	for _, unit := range graph.units {
		for _, ref := range unit.refs {
			if ref.file != unit.file {
				ref.exported = true
			}
		}
	}
	graph.render(rng)
	return graph
}

func (graph *apiGraph) keptNames() []string {
	var out []string
	for _, unit := range graph.units {
		if unit.reached {
			out = append(out, unit.name)
		}
	}
	return out
}

func (graph *apiGraph) poisonNames() []string {
	var out []string
	for _, unit := range graph.units {
		if !unit.reached {
			out = append(out, unit.name)
		}
	}
	return out
}

func (graph *apiGraph) dump() string {
	var builder strings.Builder
	for _, rel := range sortedKeys(graph.files) {
		fmt.Fprintf(&builder, "// ---- %s ----\n%s\n", rel, graph.files[rel])
	}
	return builder.String()
}

func fileName(file int) string {
	if file == 0 {
		return "api.d.ts"
	}
	return fmt.Sprintf("f%d.d.ts", file)
}

func specifierOf(file int) string { return "./" + strings.TrimSuffix(fileName(file), ".d.ts") + ".ts" }

// fileImports collects one file's import statements while its declarations are rendered.
type fileImports struct {
	named      map[int][]string // target file → bindings
	namespaces map[int]string
	barrel     []string
	heavy      bool
}

func (imports *fileImports) add(list *[]string, binding string) {
	for _, existing := range *list {
		if existing == binding {
			return
		}
	}
	*list = append(*list, binding)
}

// typeRef renders how a declaration in file names unit; inExtends rules out `import()` types, which a heritage
// clause cannot hold.
func (graph *apiGraph) typeRef(rng *rand.Rand, file int, unit *apiUnit, imports *fileImports, inExtends bool) string {
	entity := unit.name
	switch {
	case unit.global || unit.file == file:
	case unit.isType() && !inExtends && rng.Intn(4) == 0:
		entity = fmt.Sprintf("import(%q).%s", specifierOf(unit.file), unit.name)
	default:
		key := [2]int{file, unit.index}
		form, seen := graph.forms[key]
		if !seen {
			forms := []string{"named", "aliased", "namespace"}
			if file == 0 {
				forms = append(forms, "barrel")
			}
			form = forms[rng.Intn(len(forms))]
			graph.forms[key] = form
		}
		switch form {
		case "named":
			list := imports.named[unit.file]
			imports.add(&list, unit.name)
			imports.named[unit.file] = list
		case "aliased":
			entity = fmt.Sprintf("%s_as_%d", unit.name, file)
			list := imports.named[unit.file]
			imports.add(&list, unit.name+" as "+entity)
			imports.named[unit.file] = list
		case "namespace":
			namespace := fmt.Sprintf("F%dNS", unit.file)
			imports.namespaces[unit.file] = namespace
			entity = namespace + "." + unit.name
		case "barrel":
			imports.add(&imports.barrel, unit.name)
		}
	}
	switch unit.kind {
	case kindConst, kindFunction:
		return "typeof " + entity
	case kindNamespace:
		return entity + ".Inner"
	}
	return entity
}

// position wraps a type in one of the places a type can appear.
func position(rng *rand.Rand, expr string) string {
	switch rng.Intn(11) {
	case 0:
		return expr + "[]"
	case 1:
		return "Array<" + expr + ">"
	case 2:
		return expr + " | null"
	case 3:
		return "Readonly<" + expr + ">"
	case 4:
		return "Record<string, " + expr + ">"
	case 5:
		return "(input: " + expr + ") => " + expr
	case 6:
		return "(" + expr + " extends object ? " + expr + " : never)"
	case 7:
		return "{ [K in keyof " + expr + "]: " + expr + "[K] }"
	case 8:
		return "keyof " + expr
	case 9:
		return "{ [key: string]: " + expr + " }"
	}
	return expr
}

func (graph *apiGraph) render(rng *rand.Rand) {
	graph.files = map[string]string{}
	bodies := make([][]string, graph.libFiles+1)
	globals := make([][]string, graph.libFiles+1)
	imports := make([]*fileImports, graph.libFiles+1)
	for file := range imports {
		imports[file] = &fileImports{named: map[int][]string{}, namespaces: map[int]string{}}
	}
	for _, unit := range graph.units {
		text := graph.renderUnit(rng, unit, imports[unit.file])
		if unit.global {
			globals[unit.file] = append(globals[unit.file], text)
		} else {
			bodies[unit.file] = append(bodies[unit.file], text)
		}
	}
	bodies[0] = append(bodies[0], graph.renderApi(rng, imports[0])...)
	for file := 0; file <= graph.libFiles; file++ {
		var builder strings.Builder
		if file == 0 {
			builder.WriteString("import type { MiddlewareDef, RawMiddlewareDef, RouteDef, PublicApi, ApiBuildVersion } from '@mionjs/router';\nimport type { IncomingMessage } from 'node:http';\n")
		}
		builder.WriteString(imports[file].render())
		for _, body := range bodies[file] {
			builder.WriteString(body)
		}
		if len(globals[file]) > 0 {
			builder.WriteString("declare global {\n" + strings.Join(globals[file], "") + "}\n")
		}
		if file > 0 && rng.Intn(3) == 0 {
			builder.WriteString("declare module 'heavy-pkg' {\n    interface HeavyClient { POISON_aug_" + strconv.Itoa(file) + ": string }\n}\n")
		}
		builder.WriteString("export {};\n")
		graph.files[fileName(file)] = builder.String()
	}
	var barrel strings.Builder
	for file := 1; file <= graph.libFiles; file++ {
		fmt.Fprintf(&barrel, "export * from '%s';\n", specifierOf(file))
	}
	// Some names the API file takes from the barrel come through a named re-export, which wins over `export *`.
	for _, unit := range graph.units {
		for _, name := range imports[0].barrel {
			if name == unit.name && rng.Intn(2) == 0 {
				fmt.Fprintf(&barrel, "export { %s } from '%s';\n", unit.name, specifierOf(unit.file))
			}
		}
	}
	graph.files["index.d.ts"] = barrel.String()
}

func (imports *fileImports) render() string {
	var builder strings.Builder
	files := make([]int, 0, len(imports.named)+len(imports.namespaces))
	for file := range imports.named {
		files = append(files, file)
	}
	for file := range imports.namespaces {
		if _, named := imports.named[file]; !named {
			files = append(files, file)
		}
	}
	sort.Ints(files)
	for _, file := range files {
		if bindings := imports.named[file]; len(bindings) > 0 {
			fmt.Fprintf(&builder, "import type { %s } from '%s';\n", strings.Join(bindings, ", "), specifierOf(file))
		}
		if namespace := imports.namespaces[file]; namespace != "" {
			fmt.Fprintf(&builder, "import type * as %s from '%s';\n", namespace, specifierOf(file))
		}
	}
	if len(imports.barrel) > 0 {
		fmt.Fprintf(&builder, "import type { %s } from './index.ts';\n", strings.Join(imports.barrel, ", "))
	}
	if imports.heavy {
		builder.WriteString("import type { HeavyDb } from 'heavy-pkg';\n")
	}
	return builder.String()
}

// members renders a unit's refs as properties, plus a heavy-pkg member on a heavy poison unit.
func (graph *apiGraph) members(rng *rand.Rand, unit *apiUnit, refs []*apiUnit, imports *fileImports, separator string) string {
	var parts []string
	for slot, ref := range refs {
		parts = append(parts, fmt.Sprintf("p%d_%d: %s", unit.index, slot, position(rng, graph.typeRef(rng, unit.file, ref, imports, false))))
	}
	if unit.heavy {
		if rng.Intn(2) == 0 {
			imports.heavy = true
			parts = append(parts, "db: HeavyDb")
		} else {
			parts = append(parts, `client: import("heavy-pkg").HeavyClient`)
		}
	}
	if unit.generic {
		parts = append(parts, fmt.Sprintf("gen%d: T0", unit.index))
	}
	if len(parts) == 0 {
		parts = append(parts, fmt.Sprintf("id%d: string", unit.index))
	}
	return "{ " + strings.Join(parts, separator) + separator + "}"
}

func (graph *apiGraph) renderUnit(rng *rand.Rand, unit *apiUnit, imports *fileImports) string {
	export := ""
	if unit.exported && !unit.global {
		export = "export "
	}
	params := ""
	refs := unit.refs
	if unit.generic {
		params = "<T0 = " + graph.typeRef(rng, unit.file, refs[0], imports, false) + ">"
		refs = refs[1:]
	}
	// An interface's first interface ref may be read through extends instead of a member, a class's through implements.
	heritage, implemented := "", ""
	if (unit.kind == kindInterface || unit.kind == kindMergedInterface) && len(refs) > 0 && plainInterface(refs[0]) && rng.Intn(2) == 0 {
		heritage = " extends " + graph.typeRef(rng, unit.file, refs[0], imports, true)
		refs = refs[1:]
	} else if unit.kind == kindClass && len(refs) > 0 && bareInterface(refs[0]) && rng.Intn(2) == 0 {
		heritage = " implements " + graph.typeRef(rng, unit.file, refs[0], imports, true)
		implemented = fmt.Sprintf("id%d: string; ", refs[0].index)
		refs = refs[1:]
	}
	indent := ""
	if unit.global {
		indent = "    "
	}
	switch unit.kind {
	case kindInterface:
		return fmt.Sprintf("%s%sinterface %s%s%s %s\n", indent, export, unit.name, params, heritage, graph.members(rng, unit, refs, imports, "; "))
	case kindMergedInterface:
		half := len(refs) / 2
		first := graph.members(rng, unit, refs[:half], imports, "; ")
		second := graph.mergedMembers(rng, unit, refs[half:], imports)
		return fmt.Sprintf("%sinterface %s%s%s %s\n%sinterface %s%s %s\n", export, unit.name, params, heritage, first, export, unit.name, params, second)
	case kindAlias:
		return fmt.Sprintf("%stype %s%s = %s;\n", export, unit.name, params, graph.members(rng, unit, refs, imports, "; "))
	case kindClass:
		body := "{ " + implemented + strings.TrimPrefix(graph.members(rng, unit, refs, imports, "; "), "{ ")
		return fmt.Sprintf("%sdeclare class %s%s%s %s\n", export, unit.name, params, heritage, body)
	case kindConst:
		return fmt.Sprintf("%sdeclare const %s: %s;\n", export, unit.name, graph.members(rng, unit, refs, imports, "; "))
	case kindFunction:
		first := graph.members(rng, unit, refs, imports, "; ")
		return fmt.Sprintf("%sdeclare function %s(input: %s): void;\n%sdeclare function %s(input: %s, flag: boolean): string;\n", export, unit.name, first, export, unit.name, first)
	case kindNamespace:
		return fmt.Sprintf("%sdeclare namespace %s {\n    interface Inner %s\n}\n", export, unit.name, graph.members(rng, unit, refs, imports, "; "))
	}
	panic("unknown unit kind")
}

// mergedMembers renders a merge's second statement: its own refs, no heavy or generic member again.
func (graph *apiGraph) mergedMembers(rng *rand.Rand, unit *apiUnit, refs []*apiUnit, imports *fileImports) string {
	var parts []string
	for slot, ref := range refs {
		parts = append(parts, fmt.Sprintf("q%d_%d: %s", unit.index, slot, position(rng, graph.typeRef(rng, unit.file, ref, imports, false))))
	}
	if len(parts) == 0 {
		parts = append(parts, fmt.Sprintf("merged%d: number", unit.index))
	}
	return "{ " + strings.Join(parts, "; ") + "; }"
}

// bareInterface: an interface rendered as `{ id<n>: string; }` alone, so a class can implement it by restating that.
func bareInterface(unit *apiUnit) bool {
	return unit.kind == kindInterface && len(unit.refs) == 0 && !unit.generic && !unit.global && !unit.heavy
}

// plainInterface: an interface a heritage clause can name.
func plainInterface(unit *apiUnit) bool {
	return (unit.kind == kindInterface || unit.kind == kindMergedInterface) && !unit.global
}

func (graph *apiGraph) renderApi(rng *rand.Rand, imports *fileImports) []string {
	var members, publics []string
	for _, slot := range graph.slots {
		var params []string
		for position, param := range slot.params {
			params = append(params, fmt.Sprintf("a%d: %s", position, graph.typeRef(rng, 0, param, imports, false)))
		}
		var member, public string
		switch slot.kind {
		case "route":
			member = fmt.Sprintf("RouteDef<(ctx: unknown, %s) => %s>", strings.Join(params, ", "), strings.TrimPrefix(params[0], "a0: "))
			public = fmt.Sprintf(`import("@mionjs/router").PublicRoute<(%s) => Promise<%s>>`, strings.Join(params, ", "), strings.TrimPrefix(params[0], "a0: "))
		case "middleware":
			member = fmt.Sprintf("MiddlewareDef<(ctx: unknown, %s) => void>", strings.Join(params, ", "))
			public = fmt.Sprintf(`import("@mionjs/router").PublicMiddleware<(%s) => Promise<void>>`, strings.Join(params, ", "))
		case "private":
			member = fmt.Sprintf("MiddlewareDef<(ctx?: { %s }) => undefined>", strings.Join(params, "; "))
		case "raw":
			member = fmt.Sprintf("RawMiddlewareDef<(ctx: unknown, req: IncomingMessage, %s) => void>", strings.Join(params, ", "))
		}
		if slot.group {
			member = "{ " + slot.name + ": " + member + " }"
			public = "{ " + slot.name + ": " + public + " }"
		}
		members = append(members, slot.name+": "+member)
		publics = append(publics, slot.name+": "+public)
	}
	var out []string
	if graph.expanded {
		out = append(out, "export declare const api: { "+strings.Join(publics, "; ")+"; } & ApiBuildVersion<\"v1\">;\n")
	} else {
		out = append(out, "export declare const routes: {\n    "+strings.Join(members, ";\n    ")+";\n};\n",
			"export declare const api: PublicApi<typeof routes> & ApiBuildVersion<\"v1\">;\n")
	}
	for index, other := range graph.others {
		var params []string
		for position, param := range other {
			params = append(params, fmt.Sprintf("a%d: %s", position, graph.typeRef(rng, 0, param, imports, false)))
		}
		out = append(out, fmt.Sprintf("export declare function POISON_serverOnly%d(%s): void;\n", index, strings.Join(params, ", ")))
	}
	return out
}
