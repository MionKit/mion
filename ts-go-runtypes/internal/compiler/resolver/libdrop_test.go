package resolver_test

import (
	"os"
	"slices"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// setupUnderDomLib is setupInline with a real tsconfig selecting the dom lib,
// which is the only way to get `URLSearchParams` and the rest of the web platform into the
// program. The default inferred config has no `lib`, so tsgo picks the latest
// ECMAScript edition alone and none of these types exist.
func setupUnderDomLib(t *testing.T, sources map[string]string) *resolver.Session {
	t.Helper()
	return setupUnderDomLibWithTypes(t, sources, nil)
}

// setupUnderDomLibWithTypes adds the tsconfig `types` list that makes a runtime package the platform.
func setupUnderDomLibWithTypes(t *testing.T, sources map[string]string, types []string) *resolver.Session {
	t.Helper()
	typesOption := ""
	if types != nil {
		typesOption = `,"types":["` + strings.Join(types, `","`) + `"]`
	}
	return setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		tsconfig := `{"compilerOptions":{"target":"esnext","module":"esnext","moduleResolution":"bundler","strict":true,"lib":["esnext","dom"]` + typesOption + `}}`
		if err := os.WriteFile(tspath.ResolvePath(programOpts.Cwd, "tsconfig.json"), []byte(tsconfig), 0o644); err != nil {
			t.Fatalf("write tsconfig: %v", err)
		}
		config, err := program.ParseInferredConfig(programOpts.Cwd, "tsconfig.json")
		if err != nil {
			t.Fatalf("ParseInferredConfig: %v", err)
		}
		programOpts.Config = config
	})
}

// TestDiag_LibClassPropertyIsAnnouncedNotSilent — the whole reason the
// projection can stop expanding standard-library types without adding a second
// list on the TypeScript side.
//
// `DataOnly<T>` cannot ask "was this declared in the standard library" (there is
// no such predicate in TypeScript), so for a lib class like `URLSearchParams` the two sides
// disagree: Go strips it, `DataOnly<T>` keeps its data shape. The build says so
// out loud instead. A property whose value has no data form raises the
// per-family `-non-data-property-dropped` drop (Info) naming the property, and the rest of the object
// still validates and still serialises.
//
// Info, not Error, is the contract: an Error means the generated function
// throws at runtime, and this one does not.
func TestDiag_LibClassPropertyIsAnnouncedNotSilent(t *testing.T) {
	const code = `import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
interface Bookmark {id: number; title: string; link: URLSearchParams}
export const isBookmark = createValidateFn<Bookmark>();
export const encode = createJsonEncoderFn<Bookmark>(undefined, {strategy: 'mutate'});
`
	resolverSession := setupUnderDomLib(t, map[string]string{"b.ts": code})
	response := resolverSession.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"b.ts"},
		IncludeEntryModules: true,
	})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}

	seen := map[string]diagnostics.Diagnostic{}
	codes := make([]string, 0, len(response.Diagnostics))
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		seen[diagnostic.Code] = diagnostic
		codes = append(codes, diagnostic.Code)
	}
	for _, expected := range []string{
		diagnostics.CodeVLNonSerializablePropDrop,
		diagnostics.CodePJNonSerializablePropDrop,
	} {
		drop, ok := seen[expected]
		if !ok {
			t.Fatalf("expected %s naming the dropped URLSearchParams property, got %v", expected, codes)
		}
		if drop.Severity != diagnostics.SeverityInfo {
			t.Errorf("%s severity = %v, want Info (the object still validates without the property)", expected, drop.Severity)
		}
		if len(drop.Args) != 1 || drop.Args[0] != "link" {
			t.Errorf(`%s args = %v, want ["link"] (the dropped property)`, expected, drop.Args)
		}
	}
	// The drop is a PROPERTY-position warning, so no root error may fire: the
	// object serialises fine with `id` and `title`.
	for _, forbidden := range []string{
		diagnostics.CodeVLNonSerializableRoot,
		diagnostics.CodePJNonSerializableRoot,
	} {
		if _, ok := seen[forbidden]; ok {
			t.Errorf("%s must not fire — the property is dropped, not failed", forbidden)
		}
	}
}

// TestDiag_LibClassAtRootThrows — the other half of the contract. A property can
// be dropped because the object survives without it; a lib class AT ROOT leaves
// nothing to validate, so the family renders a throwing factory and the build
// gets an Error.
func TestDiag_LibClassAtRootThrows(t *testing.T) {
	const code = `import {createValidateFn} from '@mionjs/run-types';
export const isLink = createValidateFn<URLSearchParams>();
`
	resolverSession := setupUnderDomLib(t, map[string]string{"r.ts": code})
	response := resolverSession.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"r.ts"},
		IncludeEntryModules: true,
	})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	var root *diagnostics.Diagnostic
	for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
		if diagnostic.Code == diagnostics.CodeVLNonSerializableRoot {
			root = &diagnostic
			break
		}
	}
	if root == nil {
		t.Fatalf("a URLSearchParams at root must be refused with %s", diagnostics.CodeVLNonSerializableRoot)
	}
	if root.Severity != diagnostics.SeverityError {
		t.Errorf("severity = %v, want Error (the generated guard would always fail)", root.Severity)
	}
}

// A platform-declared type is not data however many files redeclare it: a property is dropped, the root refused.

// runtimeTypes loads the staged runtime packages as the environment.
var runtimeTypes = []string{"node", "handles"}

var platformTypes = []string{
	"URLSearchParams", "Headers", "AbortController", "TextEncoder", "Blob", "Request",
	"NodeJS.Timeout", "EventEmitter", "RuntimeHandle",
}

// platformFamily: drop is the property note, root the root code (the clone shares the value instead of throwing).
type platformFamily struct {
	family       corpusFamily
	drop         string
	dropSeverity diagnostics.Severity
	root         string
	rootSeverity diagnostics.Severity
}

var platformFamilies = []platformFamily{
	{corpusFamily{"validate", "createValidateFn", ""}, diagnostics.CodeVLNonSerializablePropDrop, diagnostics.SeverityInfo, diagnostics.CodeVLNonSerializableRoot, diagnostics.SeverityError},
	{corpusFamily{"encode", "createJsonEncoderFn", "{strategy: 'mutate'}"}, diagnostics.CodePJNonSerializablePropDrop, diagnostics.SeverityInfo, diagnostics.CodePJNonSerializableRoot, diagnostics.SeverityError},
	{corpusFamily{"decode", "createJsonDecoderFn", "{strategy: 'mutate'}"}, diagnostics.CodeRJNonSerializablePropDrop, diagnostics.SeverityInfo, diagnostics.CodeRJNonSerializableRoot, diagnostics.SeverityError},
	{corpusFamily{"removeUnknownKeys", "createRemoveUnknownKeysFn", ""}, diagnostics.CodeRUKNonSerializablePropDrop, diagnostics.SeverityWarning, diagnostics.CodeRUKNonSerializablePropDrop, diagnostics.SeverityWarning},
}

// platformForbidden are the errors and warnings walking the members used to raise.
var platformForbidden = []string{
	diagnostics.CodeRUKSymbolKeyedMember, diagnostics.CodeRUKFunctionPropDropped, diagnostics.CodeMarkerSelfInstantiatingGeneric,
}

// platformScan returns the runtype diagnostics of one file per case, keyed by file name.
func platformScan(t *testing.T, types []string, variant map[string]string, cases map[string]string) map[string][]diagnostics.Diagnostic {
	t.Helper()
	sources := corpusSources()
	for name, content := range variant {
		sources[name] = content
	}
	files := make([]string, 0, len(cases))
	for name, content := range cases {
		sources[name] = content
		files = append(files, name)
	}
	slices.Sort(files)
	session := setupUnderDomLibWithTypes(t, sources, types)
	byFile := map[string][]diagnostics.Diagnostic{}
	for _, file := range files {
		response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}, IncludeEntryModules: true})
		if response.Error != "" {
			t.Fatalf("%s: scanFiles: %s", file, response.Error)
		}
		// Every case gets an entry, so a file whose expected diagnostic is missing still reaches the checks.
		byFile[file] = nil
		for _, diagnostic := range runtypeDiagsOf(response.Diagnostics) {
			if strings.HasSuffix(diagnostic.Site.FilePath, file) {
				byFile[file] = append(byFile[file], diagnostic)
			}
		}
	}
	return byFile
}

const platformImports = "import {EventEmitter} from 'events';\n"

func platformCases(types []string, valueShape bool) map[string]string {
	cases := map[string]string{}
	for _, platformType := range types {
		for _, entry := range platformFamilies {
			for _, position := range []string{"property", "root"} {
				siteType := platformType
				if position == "property" {
					siteType = "{id: number; field: " + platformType + "}"
				}
				shape := "static"
				if valueShape {
					shape = "value"
				}
				name := strings.ReplaceAll(platformType, ".", "_") + "__" + position + "__" + entry.family.name + "__" + shape + ".ts"
				cases[name] = platformImports + corpusSite(entry.family, "", siteType, valueShape)
			}
		}
	}
	return cases
}

func checkPlatformDiagnostics(t *testing.T, byFile map[string][]diagnostics.Diagnostic) {
	t.Helper()
	for file, found := range byFile {
		parts := strings.Split(strings.TrimSuffix(file, ".ts"), "__")
		position, familyName := parts[1], parts[2]
		entry := platformFamilies[slices.IndexFunc(platformFamilies, func(candidate platformFamily) bool {
			return candidate.family.name == familyName
		})]
		seen := map[string]diagnostics.Diagnostic{}
		for _, diagnostic := range found {
			seen[diagnostic.Code] = diagnostic
		}
		for _, forbidden := range platformForbidden {
			if _, ok := seen[forbidden]; ok {
				t.Errorf("%s: %s must not fire, the type is taken whole", file, forbidden)
			}
		}
		switch {
		case position == "property":
			drop, ok := seen[entry.drop]
			if !ok {
				t.Errorf("%s: expected %s naming the dropped property, got %v", file, entry.drop, sortedKeys(codeSet(found)))
				continue
			}
			if drop.Severity != entry.dropSeverity {
				t.Errorf("%s: %s severity = %v, want %v", file, entry.drop, drop.Severity, entry.dropSeverity)
			}
			if len(drop.Args) != 1 || !strings.Contains(drop.Args[0], "field") {
				t.Errorf("%s: %s args = %v, want the property name", file, entry.drop, drop.Args)
			}
			for _, root := range []string{diagnostics.CodeVLNonSerializableRoot, diagnostics.CodePJNonSerializableRoot, diagnostics.CodeRJNonSerializableRoot} {
				if _, ok := seen[root]; ok {
					t.Errorf("%s: %s must not fire, the property is dropped, not failed", file, root)
				}
			}
		default:
			root, ok := seen[entry.root]
			if !ok {
				t.Errorf("%s: a platform class at the root must be reported with %s, got %v", file, entry.root, sortedKeys(codeSet(found)))
			} else if root.Severity != entry.rootSeverity {
				t.Errorf("%s: %s severity = %v, want %v", file, entry.root, root.Severity, entry.rootSeverity)
			}
		}
	}
}

func codeSet(found []diagnostics.Diagnostic) map[string]bool {
	set := map[string]bool{}
	for _, diagnostic := range found {
		set[diagnostic.Code] = true
	}
	return set
}

// An empty merge of the consumer's own never turns a platform class into the author's.
var platformMerge = map[string]string{"globals.d.ts": "interface URL {}\ninterface Headers {}\ndeclare var Headers: {new (): Headers};\n"}

// noNotDataDiagnostics fails on any drop or refusal: the type must be handled as data.
func noNotDataDiagnostics(t *testing.T, label string, byFile map[string][]diagnostics.Diagnostic) {
	t.Helper()
	for file, found := range byFile {
		for _, diagnostic := range found {
			if strings.HasSuffix(diagnostic.Code, "-non-data-property-dropped") || strings.HasSuffix(diagnostic.Code, "-root") {
				t.Errorf("%s %s: URL is data, got %s %v", label, file, diagnostic.Code, diagnostic.Args)
			}
		}
	}
}

func TestDiag_PlatformClass_Static(t *testing.T) {
	checkPlatformDiagnostics(t, platformScan(t, runtimeTypes, platformMerge, platformCases(platformTypes, false)))
}

func TestDiag_PlatformClass_Value(t *testing.T) {
	checkPlatformDiagnostics(t, platformScan(t, runtimeTypes, platformMerge, platformCases(platformTypes, true)))
}

// Each way a declaration can restate a platform class without adding to it still leaves it not data.
func TestDiag_PlatformClass_MergesThatAddNothing(t *testing.T) {
	for label, variant := range map[string]map[string]string{
		"restated members":     {"globals.d.ts": "interface Headers {get(name: string): string | null}\n"},
		"var only":             {"globals.d.ts": "declare var Headers: {new (): Headers};\n"},
		"runtime package only": nil,
	} {
		t.Run(label, func(t *testing.T) {
			checkPlatformDiagnostics(t, platformScan(t, runtimeTypes, variant, platformCases([]string{"Headers"}, false)))
		})
	}
}

// A class the consumer or an ordinary library declares is data in every family and position, in both call shapes.
func TestDiag_PlatformClass_UserDeclaredStayData(t *testing.T) {
	for _, valueShape := range []bool{false, true} {
		cases := map[string]string{}
		for _, spelled := range []string{"Dto", "Emitter", "Widget"} {
			for _, entry := range platformFamilies {
				for _, siteType := range []string{spelled, "{field: " + spelled + "}"} {
					name := spelled + "__" + entry.family.name + "__" + strings.NewReplacer("{", "p", "}", "", ":", "", " ", "").Replace(siteType) + ".ts"
					decl := "declare class Emitter {on(): void}\ninterface Widget {id: string}\ndeclare var Widget: {new (): Widget};\n"
					cases[name] = "import {Dto} from 'dto-lib';\n" + corpusSite(entry.family, decl, siteType, valueShape)
				}
			}
		}
		for file, found := range platformScan(t, runtimeTypes, nil, cases) {
			for _, diagnostic := range found {
				if strings.HasSuffix(diagnostic.Code, "-non-data-property-dropped") || strings.HasSuffix(diagnostic.Code, "-root") {
					t.Errorf("%s (value shape %v): a type the user or an ordinary library declared is data, got %s %v", file, valueShape, diagnostic.Code, diagnostic.Args)
				}
			}
		}
	}
}

// A runtime package missing from the tsconfig `types` is no platform: its classes stay data.
// `handles` is left out: the shared corpus loads it with a first-party `/// <reference types>`.
func TestDiag_PlatformClass_NotInTypesStaysData(t *testing.T) {
	for _, valueShape := range []bool{false, true} {
		for file, found := range platformScan(t, []string{}, nil, platformCases([]string{"NodeJS.Timeout", "EventEmitter"}, valueShape)) {
			for _, diagnostic := range found {
				if strings.HasSuffix(diagnostic.Code, "-non-data-property-dropped") || strings.HasSuffix(diagnostic.Code, "-root") {
					t.Errorf("%s: a package outside the tsconfig `types` is no platform, got %s %v", file, diagnostic.Code, diagnostic.Args)
				}
			}
		}
	}
}

// Every family keeps URL as data from lib.dom, a runtime package's global, `node:url` and an empty `.ts` merge.
func TestDiag_UrlFromEverySourceIsData(t *testing.T) {
	for _, valueShape := range []bool{false, true} {
		cases := platformCases([]string{"URL"}, valueShape)
		for name, content := range platformCases([]string{"NodeURL"}, valueShape) {
			cases[name] = "import {URL as NodeURL} from 'node:url';\n" + content
		}
		noNotDataDiagnostics(t, "runtime types", platformScan(t, runtimeTypes, platformMerge, cases))
		noNotDataDiagnostics(t, "no types", platformScan(t, []string{}, nil, platformCases([]string{"URL"}, valueShape)))
		tsMerge := map[string]string{"augment.ts": "export {};\ndeclare global {\n  interface URL {}\n}\n"}
		noNotDataDiagnostics(t, "empty .ts merge", platformScan(t, runtimeTypes, tsMerge, platformCases([]string{"URL"}, valueShape)))
	}
}
