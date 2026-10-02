package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

// Readonly is in the id, so convertAndCheckIDs fails on any spelling that drops it.
func TestReadonlyCollections_FullChain(t *testing.T) {
	for _, testCase := range []struct {
		source  string
		builder string
		typed   string
	}{
		{
			"export type Pair = readonly [number, Pair?];\n",
			"export type Pair = readonly [number, Pair?];\nexport const pairRT = getRunType<Pair>();",
			"export type Pair = readonly [number, Pair?];",
		},
		{
			"export type K4 = {a?: K4} | readonly [K4];\n",
			"export type K4 = readonly [K4] | {a?: K4};",
			"export type K4 = readonly [K4] | {a?: K4};",
		},
		{
			"export type Box = {readonly items: readonly [Box?]; name: string};\n",
			"RT.propMod({readonly: true}, RT.readonly(RT.tuple({optional: [RT.self()]})))",
			"readonly items: readonly [Box?]",
		},
		{
			"export type Tree = {kids: readonly Tree[]};\n",
			"RT.readonly(RT.array(RT.self()))",
			"kids: readonly Tree[]",
		},
		{
			"export type Labeled = readonly [x: number, y: string];\n",
			"getRunType<readonly [x: number, y: string]>()",
			"export type Labeled = readonly [x: number, y: string];",
		},
		{
			"export type Tagged = {tag: readonly [x: number, y?: Tagged]};\n",
			"export type Tagged = {tag: readonly [x: number, y?: Tagged]};\nexport const taggedRT = getRunType<Tagged>();",
			"tag: readonly [x: number, y?: Tagged]",
		},
		{
			"export type RoTup = readonly [string, number];\n",
			"RT.readonly(RT.tuple({required: [TF.string(), TF.number()]}))",
			"export type RoTup = readonly [string, number];",
		},
		{
			"export type RoArr = readonly string[];\n",
			"RT.readonly(RT.array(TF.string()))",
			"export type RoArr = readonly string[];",
		},
		{
			"export type RoArr2 = ReadonlyArray<number>;\n",
			"RT.readonly(RT.array(TF.number()))",
			"export type RoArr2 = readonly number[];",
		},
		{
			"export type Nested = (readonly string[])[];\n",
			"RT.array(RT.readonly(RT.array(TF.string())))",
			"export type Nested = (readonly string[])[];",
		},
		{
			"export type RoIdx = {readonly [k: string]: number};\n",
			"RT.readonly(RT.record(TF.number()))",
			"export type RoIdx = {readonly [key: string]: number};",
		},
		{
			"export type Mixed = {readonly [k: string]: number | string; a: string};\n",
			"RT.intersection(RT.readonly(RT.record(RT.union([TF.number(), TF.string()]))), RT.object({a: TF.string()}))",
			"readonly [key: string]: number | string",
		},
	} {
		builderForm := convertAndCheckIDs(t, testCase.source, convert.TargetBuilders)
		if !strings.Contains(builderForm, testCase.builder) {
			t.Errorf("builder form should contain %q:\n%s", testCase.builder, builderForm)
		}
		typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
		if !strings.Contains(typeForm, testCase.typed) {
			t.Errorf("type form should contain %q:\n%s", testCase.typed, typeForm)
		}
	}
}

func TestReadonlyCollections_NotAliasedToMutableTwin(t *testing.T) {
	source := "export type K4 = {a?: K4} | readonly [K4];\nexport type K6 = {a?: K6} | [K6];\n" +
		"export type RoList = readonly string[];\nexport type List = string[];\n" +
		"export type RoMap = {readonly [k: string]: number};\nexport type Map2 = {[k: string]: number};\n"
	ids := declIDs(t, source)
	for _, pair := range [][2]string{{"K4", "K6"}, {"RoList", "List"}, {"RoMap", "Map2"}} {
		if ids[pair[0]] == ids[pair[1]] {
			t.Errorf("%s and %s differ only in readonly but share id %s", pair[0], pair[1], ids[pair[0]])
		}
	}
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	for _, alias := range []string{"getRunType<K4>()", "getRunType<RoList>()", "getRunType<RoMap>()"} {
		if strings.Count(builderForm, alias) > 1 || strings.Contains(builderForm, "k6RT = "+alias) {
			t.Errorf("a mutable declaration was aliased to its readonly twin %s:\n%s", alias, builderForm)
		}
	}
}
