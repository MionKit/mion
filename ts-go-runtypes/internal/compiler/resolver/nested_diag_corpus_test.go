package resolver_test

import (
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

type corpusTrigger struct {
	name   string
	inline string
}

type corpusPosition struct {
	name string
	wrap func(child string) string
}

type corpusFamily struct {
	name    string
	factory string
	options string
}

var corpusTriggers = []corpusTrigger{
	{"symbol", "symbol"},
	{"symbolArray", "Array<symbol>"},
	{"function", "(() => void)"},
	{"callable", "Callable"},
	{"callableWithProp", "CallableWithProp"},
	{"never", "never"},
	{"nonSerializable", "Uint8Array"},
	{"privateFields", "Counter"},
	{"symbolKeyed", "Tagged"},
	{"objectUnion", "({a: string} | {b: number})"},
	{"promise", "Promise<string>"},
	{"regexp", "RegExp"},
	{"uniqueSymbol", "(typeof uniq)"},
	{"methodSignature", "{m(): void}"},
	{"classMethod", "WithMethod"},
	{"any", "any"},
	{"unknown", "unknown"},
}

// Written `any` / `unknown` are accepted for third-party types: any position or family, a note but never an error or throw.
var corpusAlwaysAccepted = map[string]bool{"any": true, "unknown": true}

var corpusPositions = []corpusPosition{
	{"root", func(child string) string { return child }},
	{"property", func(child string) string { return "{p: " + child + "}" }},
	{"optionalProperty", func(child string) string { return "{p?: " + child + "}" }},
	{"array", func(child string) string { return "Array<" + child + ">" }},
	{"tuple", func(child string) string { return "[" + child + "]" }},
	{"optionalTuple", func(child string) string { return "[string, " + child + "?]" }},
	{"restTuple", func(child string) string { return "[string, ..." + "Array<" + child + ">]" }},
	{"mapKey", func(child string) string { return "Map<" + child + ", string>" }},
	{"mapValue", func(child string) string { return "Map<string, " + child + ">" }},
	{"set", func(child string) string { return "Set<" + child + ">" }},
	{"indexSignature", func(child string) string { return "{[key: string]: " + child + "}" }},
	{"union", func(child string) string { return child + " | string" }},
	{"intersection", func(child string) string { return "{p: " + child + "} & {q: string}" }},
}

var corpusFamilies = []corpusFamily{
	{"validate", "createValidateFn", ""},
	{"validateStrict", "createValidateFn", "{checkUnknowns: true}"},
	{"validateUnionKeys", "createValidateFn", "{checkUnionUnknowns: true}"},
	{"validationErrors", "createGetValidationErrorsFn", ""},
	{"validationErrorsStrict", "createGetValidationErrorsFn", "{checkUnknowns: true}"},
	{"validationErrorsUnionKeys", "createGetValidationErrorsFn", "{checkUnionUnknowns: true}"},
	{"encodeClone", "createJsonEncoderFn", "{strategy: 'clone'}"},
	{"encodeMutate", "createJsonEncoderFn", "{strategy: 'mutate'}"},
	{"encodeCompact", "createJsonEncoderFn", "{strategy: 'compact'}"},
	{"decodeClone", "createJsonDecoderFn", "{strategy: 'clone'}"},
	{"decodeMutate", "createJsonDecoderFn", "{strategy: 'mutate'}"},
	{"decodeCompact", "createJsonDecoderFn", "{strategy: 'compact'}"},
	{"removeUnknownKeys", "createRemoveUnknownKeysFn", ""},
	{"removeUnknownKeysShare", "createRemoveUnknownKeysFn", "{sharedValues: 'share'}"},
	{"removeUnknownKeysRefuse", "createRemoveUnknownKeysFn", "{sharedValues: 'refuse'}"},
	{"formatTransform", "createFormatTransformFn", ""},
}

const corpusShared = `export interface Callable { (): void }
export interface CallableWithProp { (): void; label: string }
export class Counter { #count = 0; label = ''; }
const tag = Symbol('tag');
export interface Tagged { id: string; [tag]: string }
export declare const uniq: unique symbol;
export class WithMethod { label = ''; greet(): string { return this.label; } }
`

const corpusImports = `import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn, createRemoveUnknownKeysFn, createFormatTransformFn} from '@mionjs/run-types';
import type {Callable, CallableWithProp, Tagged, uniq} from './shared.ts';
import {Counter, WithMethod} from './shared.ts';
`

var alwaysThrowCode = regexp.MustCompile(`'\[([A-Z]+[0-9]+)\] `)

// Quiet by design: a format transform never touches these types, and removeUnknownKeys copies a symbol as is.
func corpusQuietAllowed(trigger corpusTrigger, family corpusFamily) bool {
	if family.name == "formatTransform" {
		return true
	}
	return family.factory == "createRemoveUnknownKeysFn" && (trigger.name == "symbol" || trigger.name == "symbolArray" || trigger.name == "uniqueSymbol")
}

// Non-data triggers: every family either drops them with a note or throws with a code, never says nothing.
var corpusNonData = map[string]bool{
	"symbol": true, "symbolArray": true, "function": true, "callable": true, "callableWithProp": true, "nonSerializable": true,
	"symbolKeyed": true, "promise": true, "regexp": true, "uniqueSymbol": true, "methodSignature": true, "classMethod": true,
}

// corpusExempt names the families the grid leaves out, each with the reason.
var corpusExempt = map[string]string{
	"jsc": "the JSON Schema family reports no diagnostics",
	"csr": "internal to registerClassSerializer, it carries a class name only",
}

type corpusCell struct {
	file   string
	named  bool
	thrown map[string]bool
	codes  []string
}

func corpusSite(family corpusFamily, decl, siteType string, valueShape bool) string {
	options := ""
	if family.options != "" {
		options = ", " + family.options
	}
	if valueShape {
		return corpusImports + decl + "declare const value: " + siteType + ";\nexport const fn = " + family.factory + "(value" + options + ");\n"
	}
	if options != "" {
		options = "undefined" + options
	}
	return corpusImports + decl + "export const fn = " + family.factory + "<" + siteType + ">(" + options + ");\n"
}

// corpusCodes are the codes reported at one file, sorted and deduped.
func corpusCodes(response protocol.Response, file string) []string {
	seen := map[string]bool{}
	for _, diagnostic := range response.Diagnostics {
		if shortFile(diagnostic.Site.FilePath) == file {
			seen[diagnostic.Code] = true
		}
	}
	return sortedKeys(seen)
}

// TestNestedDiagCorpus puts every trigger at every position, inline and named, under every family and inline mode.
// A throw is reported, a reported throw ships, inline, named and both call shapes agree, non-data never drops silently, build equals scan.
func TestNestedDiagCorpus(t *testing.T) {
	for _, trigger := range corpusTriggers {
		t.Run(trigger.name, func(t *testing.T) {
			t.Parallel()
			byCase := map[string][]corpusCell{}
			for _, allInternal := range []bool{false, true} {
				sources := map[string]string{"shared.ts": corpusShared}
				var files []string
				caseOf := map[string]string{}
				for _, named := range []bool{false, true} {
					for _, position := range corpusPositions {
						wrapped := position.wrap(trigger.inline)
						decl, siteType := "", "{w: "+wrapped+"}"
						depth := "inline"
						if named {
							decl, siteType, depth = "export type Named = "+wrapped+";\n", "{w: Named}", "named"
						}
						for _, family := range corpusFamilies {
							for _, valueShape := range []bool{false, true} {
								if valueShape && allInternal {
									continue
								}
								shape := "static"
								if valueShape {
									shape = "value"
								}
								file := depth + "__" + position.name + "__" + family.name + "__" + shape + ".ts"
								sources[file] = corpusSite(family, decl, siteType, valueShape)
								files = append(files, file)
								caseOf[file] = position.name + "/" + family.name
							}
						}
					}
				}
				sort.Strings(files)
				session := setupInlineWith(t, sources, func(programOpts *program.Options, resolverOpts *resolver.Options) {
					programOpts.SingleThreaded = true
					resolverOpts.SingleThreaded = true
					if allInternal {
						resolverOpts.InlineMode = constants.InlineModeAllInternal
					}
				})
				scanned := map[string][]string{}
				for _, file := range files {
					response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}, IncludeEntryModules: true})
					if response.Error != "" {
						t.Fatalf("%s: scanFiles: %s", file, response.Error)
					}
					cell := corpusCell{file: file, named: strings.HasPrefix(file, "named"), thrown: map[string]bool{}, codes: corpusCodes(response, file)}
					for _, source := range response.EntryModules {
						for _, match := range alwaysThrowCode.FindAllStringSubmatch(source, -1) {
							cell.thrown[match[1]] = true
						}
					}
					scanned[file] = cell.codes
					byCase[caseOf[file]] = append(byCase[caseOf[file]], cell)
					label := fmt.Sprintf("allInternal=%v %s:\n%s", allInternal, file, sources[file])
					for code := range cell.thrown {
						if !slices.Contains(cell.codes, code) {
							t.Errorf("%s\nthrows %s at runtime but the build reports only %v", label, code, cell.codes)
						}
					}
					for _, code := range cell.codes {
						if diagnostics.Definitions[code].Level == diagnostics.LevelRuntimeError && !cell.thrown[code] {
							t.Errorf("%s\nreports %s but ships no function that throws it", label, code)
						}
					}
					family := corpusFamilies[slices.IndexFunc(corpusFamilies, func(candidate corpusFamily) bool {
						return strings.Contains(file, "__"+candidate.name+"__")
					})]
					if corpusAlwaysAccepted[trigger.name] {
						for _, code := range cell.codes {
							if level := diagnostics.Definitions[code].Level; level == diagnostics.LevelRuntimeError || level == diagnostics.LevelError {
								t.Errorf("%s\nreports %s, but a written %s must be accepted", label, code, trigger.name)
							}
						}
						if len(cell.thrown) > 0 {
							t.Errorf("%s\nships a function that throws %v, but a written %s must be accepted", label, sortedKeys(cell.thrown), trigger.name)
						}
					}
					if corpusNonData[trigger.name] && len(cell.codes) == 0 && !corpusQuietAllowed(trigger, family) {
						t.Errorf("%s\ndrops a non-data value with no diagnostic", label)
					}
				}
				generated := session.Dispatch(protocol.Request{Op: protocol.OpGenerate})
				if generated.Error != "" {
					t.Fatalf("generate: %s", generated.Error)
				}
				for _, file := range files {
					if built := corpusCodes(generated, file); !slices.Equal(built, scanned[file]) {
						t.Errorf("allInternal=%v %s: the build reports %v, the dev scan %v", allInternal, file, built, scanned[file])
					}
				}
				session.Close()
			}
			for name, cells := range byCase {
				for _, cell := range cells[1:] {
					if !slices.Equal(cell.codes, cells[0].codes) {
						t.Errorf("%s: %s reports %v, %s reports %v", name, cells[0].file, cells[0].codes, cell.file, cell.codes)
					}
				}
			}
		})
	}
}

// A family added without a grid row, or a non-data kind no trigger reaches, fails here instead of going untested.
func TestNestedDiagCorpus_CoversEveryFamily(t *testing.T) {
	sources := map[string]string{"shared.ts": corpusShared}
	var files []string
	for _, family := range corpusFamilies {
		file := family.name + ".ts"
		sources[file] = corpusSite(family, "", "{a: string}", false)
		files = append(files, file)
	}
	session := setupInline(t, sources)
	covered := map[string]bool{}
	for _, file := range files {
		response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}})
		if response.Error != "" {
			t.Fatalf("%s: scanFiles: %s", file, response.Error)
		}
		for _, site := range response.Sites {
			for _, demand := range site.Demand {
				covered[demand.FamilyTag] = true
			}
		}
	}
	for _, spec := range typefunctions.Families {
		tag := spec.Settings.Tag
		reason, exempt := corpusExempt[tag]
		if !covered[tag] && !exempt {
			t.Errorf("family %s (%s) has no row in corpusFamilies: add its factory and options, or a reason to corpusExempt", spec.Key, tag)
		}
		if covered[tag] && exempt {
			t.Errorf("family %s is in the grid and exempt (%s): drop the exemption", tag, reason)
		}
	}
}

func TestNestedDiagCorpus_CoversEveryNonDataKind(t *testing.T) {
	sources := map[string]string{"shared.ts": corpusShared}
	var files []string
	for _, trigger := range corpusTriggers {
		file := trigger.name + ".ts"
		sources[file] = corpusImports + "import {getRunTypeId} from '@mionjs/run-types';\nexport const id = getRunTypeId<{w: " + trigger.inline + "; t: [" + trigger.inline + "]}>();\n"
		files = append(files, file)
	}
	session := setupInline(t, sources)
	nodes := map[string]*reflection.RunType{}
	for _, file := range files {
		response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{file}, IncludeRunTypes: true})
		if response.Error != "" {
			t.Fatalf("%s: scanFiles: %s", file, response.Error)
		}
		for _, node := range response.RunTypes {
			nodes[node.ID] = node
		}
	}
	resolve := func(ref *reflection.RunType) *reflection.RunType {
		if ref.Kind == reflection.KindRef {
			return nodes[ref.ID]
		}
		return ref
	}
	shape := func(node *reflection.RunType) string {
		switch {
		case node.Kind == reflection.KindObjectLiteral:
			return "callable interface"
		case node.Kind == reflection.KindLiteral:
			return "unique symbol"
		case node.Kind == reflection.KindClass:
			return "non-serializable class"
		}
		return fmt.Sprintf("kind %d", node.Kind)
	}
	reached := map[string]bool{}
	for _, node := range nodes {
		if reflection.NonDataOf(node, resolve) != reflection.Data {
			reached[shape(node)] = true
		}
	}
	required := []*reflection.RunType{
		{Kind: reflection.KindObjectLiteral}, {Kind: reflection.KindLiteral}, {Kind: reflection.KindClass},
	}
	for kind := reflection.KindNever; kind < 256; kind++ {
		if reflection.FamilyOf(kind) != reflection.FamilyUnknown && reflection.NonDataOf(&reflection.RunType{Kind: kind}, nil) != reflection.Data {
			required = append(required, &reflection.RunType{Kind: kind})
		}
	}
	for _, node := range required {
		if !reached[shape(node)] {
			t.Errorf("no corpus trigger reaches a non-data %s: add one to corpusTriggers", shape(node))
		}
	}
}
