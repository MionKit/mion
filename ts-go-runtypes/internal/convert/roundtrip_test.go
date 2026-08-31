package convert_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/convert"
)

// declIDs resolves every recognized declaration of main.ts and returns
// name → structural id. The name key is the TYPE name when present, else the
// const name — stable across forms because conversion preserves both.
func declIDs(t testing.TB, source string) map[string]string {
	return declIDsIn(t, map[string]string{"main.ts": source})
}

// declIDsIn is declIDs over a full sources map (extra files carry ambients
// like the Temporal fixture); ids are read from main.ts.
func declIDsIn(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	ids, idsErr := convert.DeclarationIDs(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath)
	if idsErr != nil {
		t.Fatalf("DeclarationIDs: %v", idsErr)
	}
	return ids
}

// declGraphs is declIDs for the C6 oracle: name → canonical reflection graph.
func declGraphs(t testing.TB, source string) map[string]string {
	return declGraphsIn(t, map[string]string{"main.ts": source})
}

func declGraphsIn(t testing.TB, sources map[string]string) map[string]string {
	t.Helper()
	prog, session, cwd := setupConvert(t, sources)
	defer session.Close()
	absPath := tspath.ResolvePath(cwd, "main.ts")
	graphs, graphsErr := convert.DeclarationGraphs(prog, session.Checker(), session.Cache(), session.MarkerOptions(), absPath)
	if graphsErr != nil {
		t.Fatalf("DeclarationGraphs: %v", graphsErr)
	}
	return graphs
}

// convertAndCheckIDs converts source to target and asserts every declaration
// resolves to the SAME structural id (C2) AND the same canonical reflection
// graph (C6 — information the id ignores must survive too) afterwards.
func convertAndCheckIDs(t *testing.T, source string, target convert.Target) string {
	t.Helper()
	return convertAndCheckIDsIn(t, map[string]string{"main.ts": source}, target)
}

// convertAndCheckIDsIn is the same oracle over a full sources map: main.ts is
// the converted file, everything else rides along unchanged (ambients).
func convertAndCheckIDsIn(t *testing.T, sources map[string]string, target convert.Target) string {
	t.Helper()
	output, diags := convertOneIn(t, sources, convert.Options{Target: target})
	expectNoDiags(t, diags)
	withOutput := map[string]string{}
	for rel, content := range sources {
		withOutput[rel] = content
	}
	withOutput["main.ts"] = output
	before := declIDsIn(t, sources)
	after := declIDsIn(t, withOutput)
	for name, beforeID := range before {
		afterID, ok := after[name]
		if !ok {
			t.Errorf("declaration %q disappeared after --to %s:\n%s", name, target, output)
			continue
		}
		if afterID != beforeID {
			t.Errorf("declaration %q changed id after --to %s: %s → %s\n%s", name, target, beforeID, afterID, output)
		}
	}
	if len(after) != len(before) {
		t.Errorf("declaration count changed after --to %s: %d → %d\n%s", target, len(before), len(after), output)
	}
	if !t.Failed() {
		beforeGraphs := declGraphsIn(t, sources)
		afterGraphs := declGraphsIn(t, withOutput)
		for name, beforeGraph := range beforeGraphs {
			afterGraph, ok := afterGraphs[name]
			if !ok {
				continue
			}
			if afterGraph != beforeGraph {
				t.Errorf("declaration %q lost reflection information after --to %s:\n--- before ---\n%s\n--- after ---\n%s\n--- output ---\n%s",
					name, target, beforeGraph, afterGraph, output)
			}
		}
	}
	return output
}

const atomTypeSource = "export type UserId = string;\n" +
	"type Count = number;\n" +
	"export type Flag = boolean;\n" +
	"type Name = 'ana';\n" +
	"type Answer = 42;\n" +
	"type Yes = true;\n" +
	"type Nope = null;\n" +
	"type Missing = undefined;\n" +
	"type Anything = unknown;\n" +
	"type Nothing = never;\n" +
	"type Big = bigint;\n" +
	"type BigLit = 123n;\n" +
	"type Sym = symbol;\n" +
	"type Loose = any;\n"

func TestChain_TypeToBuildersToType(t *testing.T) {
	// The full user-facing chain: type → builders → type, id-exact at every leg
	// (the fuzz lane widens this over the generated space).
	builderForm := convertAndCheckIDs(t, atomTypeSource, convert.TargetBuilders)
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{"type BigLit = 123n;", "type Answer = 42;", "type Missing = undefined;", "export type UserId = string;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("chain output missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_StructuralParamsAtTheirDefault(t *testing.T) {
	// `minItems: 0` / `minProperties: 0` say exactly what OMITTING the keyword
	// says, so the params must survive the round trip verbatim rather than
	// being read as absent.
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type ZeroMin = TF.FormattedArray<string[], {minItems: 0}>;\n" +
		"export type ZeroProps = TF.FormattedObject<Record<string, string>, {minProperties: 0}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{"{minItems: 0}", "{minProperties: 0}"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_UniqueItemsFalseEscapesGenericSpelling(t *testing.T) {
	// `uniqueItems: false` sits OUTSIDE the public params bag
	// (FormattedArrayParams declares `uniqueItems?: true`), so the generic
	// `RT.array(…, {uniqueItems: false})` spelling resolved a DIFFERENT id and
	// a follow-up --to type dropped the brand entirely. The brand must ride
	// the raw StructuralBrand spelling instead — the structural twin of the
	// `isRegex` constructor escape (TestChain_RegexPresetEscapesGenericSpelling).
	// docs/done history: filed during the json-schema-input removal.
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type LooseTags = string[] & TF.StructuralBrand<'formattedArray', {uniqueItems: false}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<string[] & TF.StructuralBrand<'formattedArray', {uniqueItems: false}>>()") {
		t.Errorf("out-of-surface structural params should escape through the raw brand spelling:\n%s", builderForm)
	}
	if strings.Contains(builderForm, "RT.array") {
		t.Errorf("the generic bag must never carry a non-public param value:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "string[] & TF.StructuralBrand<'formattedArray', {uniqueItems: false}>") {
		t.Errorf("the type form must keep the raw brand spelling:\n%s", typeForm)
	}
}

func TestChain_BigintFormatParams(t *testing.T) {
	// The bigint family's bounds ARE bigints. Negative bounds included: the
	// sign is part of the digits.
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type Small = TF.BigInt<{min: 0n, max: 255n}>;\n" +
		"export type Signed = TF.BigInt<{min: -9223372036854775808n, max: 9223372036854775807n}>;\n" +
		"export type Stepped = TF.BigInt<{multipleOf: 5n}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{
		"export type Small = TF.BigInt<{max: 255n, min: 0n}>;",
		"export type Signed = TF.BigInt<{max: 9223372036854775807n, min: -9223372036854775808n}>;",
		"export type Stepped = TF.BigInt<{multipleOf: 5n}>;",
	} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_GenericFormatFamilies(t *testing.T) {
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type Short = TF.String<{minLength: 2; maxLength: 5}>;\n" +
		"type Port = TF.Number<{min: 1; max: 65535}>;\n" +
		"type Whole = TF.Number<{integer: true}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "TF.string({maxLength: 5, minLength: 2})") {
		t.Errorf("string format should print the value-first family builder:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Short = TF.String<{maxLength: 5, minLength: 2}>;") {
		t.Errorf("type target should print the brand alias:\n%s", typeForm)
	}
}

func TestChain_NamedFormatPresets(t *testing.T) {
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type Contact = TF.Email;\n" +
		"type Uid = TF.UUIDv4;\n" +
		"type AnyUid = TF.UUID;\n" +
		"type Site = TF.Url;\n" +
		"type Host = TF.Hostname;\n" +
		"type Day = TF.StringDate;\n" +
		"type When = TF.Date<{min: 'now'}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{"TF.uuidv4()", "TF.uuid()", "TF.date({min: 'now'})", "getRunType<TypeFormat<string, 'domain', {"} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

func TestChain_RegexPresetEscapesGenericSpelling(t *testing.T) {
	// The regex family's params carry the preset-internal `isRegex` engine
	// flag, which the PUBLIC string builder/alias reject (ExactParams) — the
	// generic `TF.string({isRegex: …})` spelling resolved a DIFFERENT brand
	// and moved the id (found by the FE roundtrip fuzz lane). Any generic
	// family carrying a key outside its public surface must ride the exact
	// TypeFormat constructor instead.
	source := "import * as TF from '@mionjs/run-types/formats';\n" +
		"export type Pattern = TF.RegexString;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<TypeFormat<string, 'stringFormat', {isRegex: true") {
		t.Errorf("preset-internal params should escape through the exact constructor:\n%s", builderForm)
	}
	if strings.Contains(builderForm, "TF.string({isRegex") {
		t.Errorf("the generic spelling must never carry a non-public param key:\n%s", builderForm)
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

func TestChain_ArraysAndTuples(t *testing.T) {
	source := "export type Tags = string[];\n" +
		"type Grid = number[][];\n" +
		"type Pair = [string, number];\n" +
		"type WithOpt = [string, number?];\n" +
		"type WithRest = [boolean, ...string[]];\n" +
		"type Lits = ['a', 2, true][];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"RT.array(TF.string())",
		"RT.array(RT.array(TF.number()))",
		"RT.tuple({required: [TF.string(), TF.number()]})",
		"RT.tuple({required: [TF.string()], optional: [TF.number()]})",
		"RT.tuple({required: [RT.boolean()], rest: TF.string()})",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{"type Grid = number[][];", "type WithOpt = [string, number?];", "type WithRest = [boolean, ...string[]];"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

// A `never` rest is uninhabited, so it contributes no elements and TypeScript
// folds `[T, ...never[]]` into a shape that rebuilding the group spelling
// (`RT.tuple({required: […], rest: RT.never()})`) does not resolve back to — the
// id changed on the builders leg. Found by the convert fuzz soak (seed
// 32080010770, iteration 131, oracle C2). The type-argument escape is id-exact,
// same remedy as TestChain_UniqueItemsFalseEscapesGenericSpelling. Every OTHER
// rest element still prints the group form (TestChain_ArraysAndTuples pins
// `[boolean, ...string[]]`), so the escape is scoped to the never rest alone.
func TestChain_NeverRestTupleEscapesGroupSpelling(t *testing.T) {
	source := "export type NeverRest = [any, ...never[]];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<[any, ...never[]]>()") {
		t.Errorf("a never-rest tuple must take the type-argument escape:\n%s", builderForm)
	}
	if strings.Contains(builderForm, "rest: RT.never()") {
		t.Errorf("the group spelling is not id-exact for a never rest:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "[any, ...never[]]") {
		t.Errorf("the type form must keep the written tuple:\n%s", typeForm)
	}
}

func TestChain_StructuralParams(t *testing.T) {
	source := "import * as RT from '@mionjs/run-types/builders';\n" +
		"import * as TF from '@mionjs/run-types/formats';\n" +
		"import {type InferType} from '@mionjs/run-types';\n" +
		"export const uniqRT = RT.array(TF.string(), {uniqueItems: true, maxItems: 4});\n" +
		"export type Uniq = InferType<typeof uniqRT>;\n" +
		"const cntRT = RT.array(TF.number(), {contains: TF.number({min: 5}), minContains: 2});\n" +
		"type Cnt = InferType<typeof cntRT>;\n" +
		"const keysRT = RT.record(TF.string(), {minProperties: 1, propertyNames: TF.string({maxLength: 3})});\n" +
		"type Keys = InferType<typeof keysRT>;\n" +
		"const patRT = RT.record(RT.unknown(), {patternProperties: {'^a': TF.number()}});\n" +
		"type Pat = InferType<typeof patRT>;\n"
	typeForm := convertAndCheckIDs(t, source, convert.TargetType)
	if !strings.Contains(typeForm, "TF.FormattedArray<TF.String<{}>[], {maxItems: 4, uniqueItems: true}>") &&
		!strings.Contains(typeForm, "TF.FormattedArray<string[], {maxItems: 4, uniqueItems: true}>") {
		t.Errorf("type form missing the FormattedArray spelling:\n%s", typeForm)
	}
}

func TestChain_Objects(t *testing.T) {
	// The spec's own motivating example: docs/done/format-conversion-layer.md.
	source := "export type MyType = {\n" +
		"  id: number;\n" +
		"  name: string;\n" +
		"  tags: string[];\n" +
		"  active?: boolean;\n" +
		"};\n" +
		"type Nested = {meta: {'a b': string; flags: boolean[]}};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"RT.object({id: TF.number(), name: TF.string(), tags: RT.array(TF.string()), active: RT.optional(RT.boolean())})",
		"RT.object({meta: RT.object({'a b': TF.string(), flags: RT.array(RT.boolean())})})",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type MyType = {id: number; name: string; tags: string[]; active?: boolean};") {
		t.Errorf("type form missing the object shape:\n%s", typeForm)
	}
}

func TestChain_IndexShapesPrintRecord(t *testing.T) {
	// `record(key, value)` takes ANY key type, and several index signatures
	// sharing one value type ARE `Record<K1 | K2, V>` — so these print the
	// real builder rather than an escape.
	for _, testCase := range []struct{ source, builder string }{
		{"export type Numeric = {[key: number]: string};\n", "RT.record(TF.number(), TF.string())"},
		{"export type Both = {[k: string]: number; [n: number]: number};\n", "RT.record(RT.union([TF.number(), TF.string()]), TF.number())"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.builder) {
			t.Errorf("expected %q for %q:\n%s", testCase.builder, testCase.source, builderForm)
		}
		convertAndCheckIDs(t, builderForm, convert.TargetType)
	}

	// Named members BESIDE an index print the INTERSECTION: `object(...)`
	// cannot carry an index and `record(...)` cannot carry named members, but
	// `Record<K, V> & {…}` is exactly what TypeScript resolves the mixed
	// literal to, so the id is identical. Optional, readonly and narrower
	// members all ride it, on every target.
	for _, testCase := range []struct{ source, wants string }{
		{source: "export type Mixed = {name: string; [key: string]: unknown};\n", wants: "RT.intersection(RT.record(RT.unknown()), RT.object({name: TF.string()}))"},
		{source: "export type Loose = {name?: string; [key: string]: unknown};\n", wants: "RT.optional(TF.string())"},
		{source: "export type Frozen = {readonly name: string; [key: string]: unknown};\n", wants: "RT.propMod({readonly: true}, TF.string())"},
		{source: "export type Typed = {id: 'a' | 'b'; [key: string]: string};\n", wants: "RT.intersection(RT.record(TF.string()), RT.object({id:"},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.wants) {
			t.Errorf("expected %q for %q:\n%s", testCase.wants, testCase.source, builderForm)
		}
		convertAndCheckIDs(t, builderForm, convert.TargetType)
	}
}

func TestChain_UnknownAbsorbedUnion(t *testing.T) {
	// `string | unknown` IS `unknown` to the checker — the union collapses
	// BEFORE reflection, so there is only one type and one id. The generated
	// functions are unknown's, and the converter prints the collapsed spelling
	// from the first leg on; the discarded members can never resurface, and no
	// id can move because no second type ever existed.
	source := "export type Loose = string | unknown;\n" +
		"type Both = {a: number} | unknown;\n" +
		"type Gone = string | never;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.unknown()") || strings.Contains(builderForm, "RT.union(") {
		t.Errorf("an unknown-absorbed union should print the collapsed spelling, not a union:\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "TF.string()") {
		t.Errorf("never should vanish, leaving the plain member:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Loose = unknown;") {
		t.Errorf("the type target restores the collapsed union as plain unknown:\n%s", typeForm)
	}
}

func TestChain_Unions(t *testing.T) {
	source := "export type Status = 'draft' | 'live';\n" +
		"type MaybeName = string | null;\n" +
		"type Mixed = number | boolean[] | {kind: 'a'; size: number};\n" +
		"type OptionalIsh = string | undefined;\n" +
		"type Items = ('a' | 'b')[];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"RT.union([RT.literal('draft'), RT.literal('live')])",
		"RT.union([RT.literal(null), TF.string()])",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{"type Items = ('a' | 'b')[];", "export type Status = 'draft' | 'live';"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_Natives(t *testing.T) {
	source := "export type Stamp = Date;\n" +
		"type Lookup = Map<string, number[]>;\n" +
		"type Bag = Set<'a' | 'b'>;\n" +
		"type Later = Promise<{ok: boolean}>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, expected := range []string{
		"TF.date()",
		"RT.map(TF.string(), RT.array(TF.number()))",
		"RT.set(RT.union([RT.literal('a'), RT.literal('b')]))",
		"RT.promise(RT.object({ok: RT.boolean()}))",
	} {
		if !strings.Contains(builderForm, expected) {
			t.Errorf("builder form missing %q:\n%s", expected, builderForm)
		}
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{"export type Stamp = Date;", "type Lookup = Map<string, number[]>;", "type Bag = Set<'a' | 'b'>;", "type Later = Promise<{ok: boolean}>;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestChain_Records(t *testing.T) {
	source := "export type Env = Record<string, string>;\n" +
		"type Counts = {[key: string]: number};\n" +
		"type Deep = Record<string, {ok: boolean} | null>;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.record(TF.string())") || !strings.Contains(builderForm, "RT.record(TF.number())") {
		t.Errorf("records should print RT.record:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	for _, expected := range []string{"export type Env = Record<string, string>;", "type Counts = Record<string, number>;"} {
		if !strings.Contains(typeForm, expected) {
			t.Errorf("type form missing %q:\n%s", expected, typeForm)
		}
	}
}

func TestReadonlyMember_FullChain(t *testing.T) {
	source := "type WithRO = {readonly id: string; count: number};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.object({id: RT.propMod({readonly: true}, TF.string()), count: TF.number()})") {
		t.Errorf("readonly member should ride propMod:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "type WithRO = {readonly id: string; count: number};") {
		t.Errorf("readonly modifier must survive the full chain:\n%s", typeForm)
	}
}

func TestChain_LabeledTuple(t *testing.T) {
	source := "type Point = [x: number, y: number];\n" +
		"export type Span = [start: number, len?: number, ...rest: string[]];\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.tuple({required: [RT.slot('x', TF.number()), RT.slot('y', TF.number())]})") {
		t.Errorf("labeled tuples should print the slot form:\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "RT.tuple({required: [RT.slot('start', TF.number())], optional: [RT.slot('len', TF.number())], rest: RT.slot('rest', TF.string())})") {
		t.Errorf("optional and rest slots should carry their labels:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "type Point = [x: number, y: number];") ||
		!strings.Contains(typeForm, "export type Span = [start: number, len?: number, ...rest: string[]];") {
		t.Errorf("type target should restore the labeled spellings:\n%s", typeForm)
	}
}

func TestChain_NamedFunctionParams(t *testing.T) {
	// All-required named params ride the slot form; optional/rest params keep
	// the getRunType escape (their value-first spellings have no id-exact
	// twin) — TestChain_Functions pins that side.
	source := "export type Send = (event: string, retries: number) => boolean;\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.func({params: [RT.slot('event', TF.string()), RT.slot('retries', TF.number())], ret: RT.boolean()})") {
		t.Errorf("named function params should print the slot form:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "export type Send = (event: string, retries: number) => boolean;") {
		t.Errorf("type target should restore the named signature:\n%s", typeForm)
	}
}

func TestChain_ImportLayoutPathIndependent(t *testing.T) {
	// The FE roundtrip fuzz lane's find (seed 0x5150): a kept user binding on
	// a managed module rides its own statement once the builders form renders
	// namespace + named as two statements — the NEXT leg's scan must fold that
	// extra statement back into the canonical block, or its position depends
	// on which legs the file has been through.
	source := "import type * as TF from '@mionjs/run-types/formats';\n" +
		"import type {AnyOf as TFAnyOf} from '@mionjs/run-types/builders';\n" +
		"export type Boxed = TF.FormattedObject<Record<string, string>, {minProperties: 2}>;\n"
	buildersForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	passA := convertAndCheckIDs(t, buildersForm, convert.TargetType)
	wantBlock := "import {type AnyOf as TFAnyOf} from '@mionjs/run-types/builders';\n" +
		"import * as TF from '@mionjs/run-types/formats';\n"
	if !strings.Contains(passA, wantBlock) {
		t.Errorf("managed imports must land as one canonical block (kept user binding folded):\n%s", passA)
	}
}

func TestAnonymousCycle_Refused(t *testing.T) {
	// A cycle that never passes through a NAMED declaration root has no
	// spelling (`self()` / `$ref: '#'` bind the root only): the indexed
	// access below makes the INNER object cycle on itself while only the
	// outer object is named. The declaration errors and stays untouched.
	source := "type Outer = {inner: {back?: Outer['inner']}};\ntype Plain = string;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	foundCycleDiag := false
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeUnsupportedKind && strings.Contains(diagnostic.Message, "cycle") {
			foundCycleDiag = true
		}
	}
	if !foundCycleDiag {
		t.Fatalf("expected a CNV001 unnamed-cycle diagnostic, got %+v", diags)
	}
	if !strings.Contains(output, "const plainRT = TF.string();") {
		t.Errorf("the rest of the file still converts:\n%s", output)
	}
}

func TestAnonymousCycle_RescuedByNamingIt(t *testing.T) {
	// Naming the cycling inner type turns the unnamed cycle into an ordinary
	// declaration reference, so the same shape converts.
	source := "type Outer = {inner: {back?: Outer['inner']}};\ntype Cut = Outer['inner'];\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	expectNoDiags(t, diags)
	if !strings.Contains(output, "getRunType<Cut>()") || !strings.Contains(output, "RT.circular(") {
		t.Errorf("naming the inner cycle should convert via a reference + its own circular:\n%s", output)
	}
}

func TestGenericDecl_Refused(t *testing.T) {
	source := "type Box<T> = T;\ntype Plain = string;\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) != 1 || diags[0].Code != convert.CodeGenericDecl {
		t.Fatalf("expected one CNV002, got %+v", diags)
	}
	if !strings.Contains(output, "type Box<T> = T;") || !strings.Contains(output, "const plainRT = TF.string();") {
		t.Errorf("generic declarations stay untouched while the rest converts:\n%s", output)
	}
}
