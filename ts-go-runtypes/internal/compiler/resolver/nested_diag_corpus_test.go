package resolver_test

import (
	"fmt"
	"regexp"
	"slices"
	"sort"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
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
}

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
`

const corpusImports = `import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn, createRemoveUnknownKeysFn, createFormatTransformFn} from '@mionjs/run-types';
import type {Callable, CallableWithProp, Tagged} from './shared.ts';
import {Counter} from './shared.ts';
`

var alwaysThrowCode = regexp.MustCompile(`'\[([A-Z]+[0-9]+)\] `)

// Quiet by design: a format transform never touches these types, and removeUnknownKeys copies a symbol as is.
func corpusQuietAllowed(trigger corpusTrigger, family corpusFamily) bool {
	if family.name == "formatTransform" {
		return true
	}
	return family.factory == "createRemoveUnknownKeysFn" && (trigger.name == "symbol" || trigger.name == "symbolArray")
}

// Non-data triggers: every family either drops them with a note or throws with a code, never says nothing.
var corpusNonData = map[string]bool{"symbol": true, "symbolArray": true, "function": true, "callable": true, "callableWithProp": true, "nonSerializable": true, "symbolKeyed": true}

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

// TestNestedDiagCorpus puts every trigger at every position, inline and named, under every family, in both inline
// modes, and holds the dev scan to four rules: a throw is reported at the site, a reported always-throw code has
// its throw, the inline and named child report the same codes in both modes, and a non-data trigger is never
// dropped without a word. The build pass must then report what the scan did.
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
								caseOf[file] = position.name + "/" + family.name + "/" + shape
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
