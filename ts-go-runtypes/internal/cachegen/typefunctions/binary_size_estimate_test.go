package typefunctions

import (
	"testing"

	// Side-effect: registers the numeric/string/datetime format emitters so
	// LookupForRunType resolves them (the binary BinarySizer hint path).
	_ "github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// generous estimates with no MaxBytes clamp interfering — Bias 1 takes the most
// generous anchor so the arithmetic is easy to pin.
func genConfig() SizeEstimateConfig {
	return SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 32, MaxBytes: 1 << 20}
}

func numberFmt(params map[string]any) *reflection.RunType {
	return &reflection.RunType{Kind: reflection.KindNumber, FormatAnnotation: &reflection.FormatAnnotation{Name: "numberFormat", Params: params}}
}

func estimate(rt *reflection.RunType, cfg SizeEstimateConfig) int {
	return EstimateBinarySize(rt, map[string]*reflection.RunType{}, cfg)
}

func TestEstimate_Scalars(t *testing.T) {
	cfg := genConfig()
	cases := []struct {
		name string
		rt   *reflection.RunType
		want int
	}{
		{"bool", &reflection.RunType{Kind: reflection.KindBoolean}, 1},
		{"null", &reflection.RunType{Kind: reflection.KindNull}, 1},
		{"number float64", &reflection.RunType{Kind: reflection.KindNumber}, 8},
		{"date", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindDate}, 8},
		{"literal", &reflection.RunType{Kind: reflection.KindLiteral}, 1}, // 0 bytes, floored to 1
	}
	for _, tc := range cases {
		if got := estimate(tc.rt, cfg); got != tc.want {
			t.Errorf("%s: estimate = %d, want %d", tc.name, got, tc.want)
		}
	}
}

// A packed numeric format must reduce the estimate to the SAME width
// EmitToBinary writes — the single source of truth the BinarySizer enforces.
func TestEstimate_NumberFormatPacking(t *testing.T) {
	cfg := genConfig()
	cases := []struct {
		name string
		rt   *reflection.RunType
		want int
	}{
		{"uint8", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 255.0}), 1},
		{"uint16", numberFmt(map[string]any{"integer": true, "min": 0.0, "max": 65535.0}), 2},
		{"int16", numberFmt(map[string]any{"integer": true, "min": -1000.0, "max": 1000.0}), 2},
		{"int32", numberFmt(map[string]any{"integer": true, "min": -100000.0, "max": 100000.0}), 4},
		{"wide -> float64", numberFmt(map[string]any{"integer": true, "min": -1e15, "max": 1e15}), 8},
		{"float -> float64", numberFmt(map[string]any{"float": true}), 8},
	}
	for _, tc := range cases {
		if got := estimate(tc.rt, cfg); got != tc.want {
			t.Errorf("%s: estimate = %d, want %d", tc.name, got, tc.want)
		}
	}
}

func TestEstimate_String(t *testing.T) {
	cfg := genConfig()
	// no format: varint(32) + 32 = 1 + 32 = 33
	if got := estimate(&reflection.RunType{Kind: reflection.KindString}, cfg); got != 33 {
		t.Errorf("unbounded string: estimate = %d, want 33", got)
	}
	// maxLength 10: bias 1 takes the max -> varint(10)+10 = 11
	bounded := &reflection.RunType{Kind: reflection.KindString, FormatAnnotation: &reflection.FormatAnnotation{
		Name: "stringFormat", Params: map[string]any{"maxLength": 10.0}}}
	if got := estimate(bounded, cfg); got != 11 {
		t.Errorf("maxLength string: estimate = %d, want 11", got)
	}
}

func TestEstimate_ObjectRequiredOptionalBitmap(t *testing.T) {
	cfg := genConfig()
	prop := func(name string, optional bool, child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindProperty, Name: name, Optional: optional, Child: child}
	}
	num := &reflection.RunType{Kind: reflection.KindNumber}
	// two required numbers: 8 + 8, no bitmap
	obj := &reflection.RunType{Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{
		prop("a", false, num), prop("b", false, num)}}
	if got := estimate(obj, cfg); got != 16 {
		t.Errorf("two required: estimate = %d, want 16", got)
	}
	// one required + one optional: 8 + (8*bias1) + ceil(1/8)=1 bitmap = 17
	objOpt := &reflection.RunType{Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{
		prop("a", false, num), prop("b", true, num)}}
	if got := estimate(objOpt, cfg); got != 17 {
		t.Errorf("one required one optional: estimate = %d, want 17", got)
	}
}

// Map/Set element types live on Arguments (synthetic KindParameter wrappers),
// NOT Children — the estimate must read them there, then descend the parameter
// to its Child. Otherwise every element defaults to StringBytes.
func TestEstimate_MapSetElementFromArguments(t *testing.T) {
	cfg := genConfig() // Items 100, StringBytes 32
	num := &reflection.RunType{Kind: reflection.KindNumber}
	param := func(id string, sub reflection.ReflectionSubKind, child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{ID: id, Kind: reflection.KindParameter, SubKind: sub, Child: child}
	}
	// Set<number>: varint(100)=1 + 100*8 = 801 (NOT 100*StringBytes).
	setItem := param("p_si", reflection.SubKindSetItem, num)
	set := &reflection.RunType{ID: "set", Kind: reflection.KindClass, SubKind: reflection.SubKindSet,
		Arguments: []*reflection.RunType{reflection.NewRef("p_si")}}
	refSet := map[string]*reflection.RunType{"p_si": setItem, "set": set}
	if got := EstimateBinarySize(set, refSet, cfg); got != 801 {
		t.Errorf("Set<number>: estimate = %d, want 801 (1 + 100*8)", got)
	}
	// Map<number, number>: varint(100)=1 + 100*(8+8) = 1601.
	mapRT := &reflection.RunType{ID: "map", Kind: reflection.KindClass, SubKind: reflection.SubKindMap,
		Arguments: []*reflection.RunType{reflection.NewRef("p_mk"), reflection.NewRef("p_mv")}}
	refMap := map[string]*reflection.RunType{
		"p_mk": param("p_mk", reflection.SubKindMapKey, num), "p_mv": param("p_mv", reflection.SubKindMapValue, num), "map": mapRT}
	if got := EstimateBinarySize(mapRT, refMap, cfg); got != 1601 {
		t.Errorf("Map<number,number>: estimate = %d, want 1601 (1 + 100*16)", got)
	}
}

// Type-constrained / variable content whose serString reserve (MAX_VARINT + 3*L)
// the mock can't shrink: the estimate must budget that reserve, not the wire size.
func TestEstimate_VariableContentFloors(t *testing.T) {
	cfg := genConfig() // Items 100, StringBytes 32
	tiny := SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 1, MaxBytes: 1 << 20}

	// String-membered enum: budget the largest member's serEnum reserve
	// 4 + MAX_VARINT(5) + 3*utf16Len. "alpha" (5) => 4+5+15 = 24.
	strEnum := &reflection.RunType{Kind: reflection.KindEnum, Values: []any{"alpha", "be", "c"}}
	if got := estimate(strEnum, cfg); got != 24 {
		t.Errorf("string enum: estimate = %d, want 24 (4 + 5 + 3*5)", got)
	}
	// Numeric / empty enums stay at the 8-byte floor (serEnum number branch).
	numEnum := &reflection.RunType{Kind: reflection.KindEnum, Values: []any{int64(0), int64(1)}}
	if got := estimate(numEnum, cfg); got != 8 {
		t.Errorf("number enum: estimate = %d, want 8", got)
	}

	// A RegExp is not data and never reaches the wire, so it reserves nothing
	// beyond the estimator's one-byte floor (the same as a function).
	regexp := &reflection.RunType{Kind: reflection.KindRegexp}
	fn := &reflection.RunType{Kind: reflection.KindFunction}
	if got, want := estimate(regexp, tiny), estimate(fn, tiny); got != want {
		t.Errorf("regexp: estimate = %d, want %d (the non-data floor)", got, want)
	}

	// A plain string floors at 8 (the shortest mock string reserves 5+3).
	str := &reflection.RunType{Kind: reflection.KindString}
	if got := estimate(str, tiny); got != 8 {
		t.Errorf("string at StringBytes=1: estimate = %d, want 8 (floor)", got)
	}
}

// A template literal renders to ONE serString; the estimate must budget the static
// texts + per-placeholder fragments. A non-packing bigint brand is mocked within its
// own bounds, so its decimal reserve must be budgeted from the brand's params.
func TestEstimate_TemplateLiteralAndBrandedBigint(t *testing.T) {
	tiny := SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 1, MaxBytes: 1 << 20}

	// `user-${string}` at StringBytes=1: 5 static + 1 content => MAX_VARINT + 3*6 = 23.
	tpl := &reflection.RunType{Kind: reflection.KindTemplateLiteral, Literal: map[string]any{
		"templateLiteral": map[string]any{
			"texts":        []any{"user-", ""},
			"placeholders": []any{map[string]any{"kind": int(reflection.KindString)}},
		}}}
	if got := estimate(tpl, tiny); got != 23 {
		t.Errorf("template `user-${string}`: estimate = %d, want 23 (5 + 3*6)", got)
	}

	// A non-packing 128-bit bigint brand budgets its longest decimal param
	// ("-1000000000000000000000" = 23 chars) => MAX_VARINT + 3*23 = 74.
	wide := &reflection.RunType{Kind: reflection.KindBigInt, FormatAnnotation: &reflection.FormatAnnotation{
		Name: "bigintFormat", Params: map[string]any{
			"min": "-1000000000000000000000n", "max": "1000000000000000000000n"}}}
	if got := estimate(wide, tiny); got != 74 {
		t.Errorf("128-bit branded bigint: estimate = %d, want 74 (5 + 3*23)", got)
	}
}

// The flat union object branch writes a sub-discriminator (when >1 object member)
// + a merged optional bitmap that the per-member estimate doesn't cover; unionBytes
// must add that framing so the seed never under-allocates an object-member union.
func TestEstimate_UnionObjectBranchFraming(t *testing.T) {
	cfg := genConfig()
	prop := func(name string, optional bool, child *reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindProperty, Name: name, Optional: optional, Child: child}
	}
	lit := &reflection.RunType{Kind: reflection.KindLiteral}
	num := &reflection.RunType{Kind: reflection.KindNumber}
	obj := func(children ...*reflection.RunType) *reflection.RunType {
		return &reflection.RunType{Kind: reflection.KindObjectLiteral, Children: children}
	}

	// Object-member unions must be SOUND (estimate >= the exact wire) — the object
	// branch adds a sub-discriminator + merged bitmap the old estimate omitted.
	// 3 literal-only object members: exact wire is 2 (sentinel + sub-disc).
	u3 := &reflection.RunType{Kind: reflection.KindUnion, Children: []*reflection.RunType{
		obj(prop("k", false, lit)), obj(prop("k", false, lit)), obj(prop("k", false, lit))}}
	if got := estimate(u3, cfg); got < 2 {
		t.Errorf("3 literal-object union: estimate = %d, want >= 2 (exact wire)", got)
	}
	// 2 object members, one required number each: exact wire is 10.
	u2 := &reflection.RunType{Kind: reflection.KindUnion, Children: []*reflection.RunType{
		obj(prop("a", false, num)), obj(prop("b", false, num))}}
	if got := estimate(u2, cfg); got < 10 {
		t.Errorf("2 object union: estimate = %d, want >= 10 (exact wire)", got)
	}
	// Atomic unions are tight + unchanged: disc(1) + max(8) = 9.
	atomic := &reflection.RunType{Kind: reflection.KindUnion, Children: []*reflection.RunType{
		{Kind: reflection.KindBoolean}, num}}
	if got := estimate(atomic, cfg); got != 9 {
		t.Errorf("atomic union: estimate = %d, want 9", got)
	}
}

func TestEstimate_ArrayAndItemsAndCap(t *testing.T) {
	num := &reflection.RunType{Kind: reflection.KindNumber}
	arr := &reflection.RunType{Kind: reflection.KindArray, Child: num}
	// items 100, element 8: varint(100)=1 + 100*8 = 801
	if got := estimate(arr, SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 32, MaxBytes: 1 << 20}); got != 801 {
		t.Errorf("array of 100 numbers: estimate = %d, want 801", got)
	}
	// MaxBytes clamp brings the same array down to the cap
	if got := estimate(arr, SizeEstimateConfig{Bias: 1, Items: 100, StringBytes: 32, MaxBytes: 64}); got != 64 {
		t.Errorf("array clamp: estimate = %d, want 64", got)
	}
}

// A self-referential type must terminate (cycle break) and stay bounded.
func TestEstimate_CycleTerminates(t *testing.T) {
	node := &reflection.RunType{ID: "n1", Kind: reflection.KindObjectLiteral}
	selfRef := &reflection.RunType{Kind: reflection.KindRef, ID: "n1"}
	child := &reflection.RunType{Kind: reflection.KindProperty, Name: "self", Child: selfRef}
	node.Children = []*reflection.RunType{child}
	refTable := map[string]*reflection.RunType{"n1": node}
	got := EstimateBinarySize(node, refTable, genConfig())
	if got < 1 || got > genConfig().MaxBytes {
		t.Errorf("cyclic type: estimate = %d, want in [1, MaxBytes]", got)
	}
}
