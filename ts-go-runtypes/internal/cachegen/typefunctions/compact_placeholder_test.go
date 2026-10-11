package typefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// wireClassesOfRoot runs compactWireClasses over the last node of a fixture, the rest serving as its ref table.
func wireClassesOfRoot(nodes []*reflection.RunType) wireClasses {
	refTable := make(map[string]*reflection.RunType, len(nodes))
	for _, node := range nodes {
		refTable[node.ID] = node
	}
	ctx := &EmitContext{walker: &Walker{RefTable: refTable}}
	return compactWireClasses(nodes[len(nodes)-1], ctx, make(map[string]struct{}))
}

// wireNode builds a one-node fixture of kind, its Child (if any) pointing at a number.
func wireNode(kind reflection.ReflectionKind) func() []*reflection.RunType {
	return func() []*reflection.RunType {
		num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
		return []*reflection.RunType{num, {ID: "root", Kind: kind, Child: makeRef("num")}}
	}
}

type wireClassRow struct {
	build func() []*reflection.RunType
	want  wireClasses
}

// wireClassByKind is compactWireClasses' arm per kind, read against the real code below.
var wireClassByKind = map[reflection.ReflectionKind]wireClassRow{
	reflection.KindNever:             {wireNode(reflection.KindNever), 0},
	reflection.KindAny:               {wireNode(reflection.KindAny), wireAll},
	reflection.KindUnknown:           {wireNode(reflection.KindUnknown), wireAll},
	reflection.KindVoid:              {wireNode(reflection.KindVoid), wireNull},
	reflection.KindObject:            {wireNode(reflection.KindObject), wireAll},
	reflection.KindString:            {wireNode(reflection.KindString), 0},
	reflection.KindNumber:            {wireNode(reflection.KindNumber), wireNumber},
	reflection.KindBoolean:           {wireNode(reflection.KindBoolean), wireBoolean},
	reflection.KindSymbol:            {wireNode(reflection.KindSymbol), 0},
	reflection.KindBigInt:            {wireNode(reflection.KindBigInt), 0},
	reflection.KindNull:              {wireNode(reflection.KindNull), wireNull},
	reflection.KindUndefined:         {wireNode(reflection.KindUndefined), wireNull},
	reflection.KindRegexp:            {wireNode(reflection.KindRegexp), 0},
	reflection.KindLiteral:           {literalFixture("a"), 0},
	reflection.KindTemplateLiteral:   {wireNode(reflection.KindTemplateLiteral), 0},
	reflection.KindProperty:          {wireNode(reflection.KindProperty), wireNumber},
	reflection.KindMethod:            {wireNode(reflection.KindMethod), 0},
	reflection.KindFunction:          {wireNode(reflection.KindFunction), 0},
	reflection.KindParameter:         {wireNode(reflection.KindParameter), wireAll},
	reflection.KindPromise:           {wireNode(reflection.KindPromise), 0},
	reflection.KindClass:             {classFixture(reflection.SubKindDate, ""), 0},
	reflection.KindTypeParameter:     {wireNode(reflection.KindTypeParameter), wireAll},
	reflection.KindEnum:              {enumFixture(1.0, 2.0), wireNumber},
	reflection.KindUnion:             {numberOrNullFixture, wireNumber | wireNull},
	reflection.KindIntersection:      {wireNode(reflection.KindIntersection), wireAll},
	reflection.KindArray:             {wireNode(reflection.KindArray), 0},
	reflection.KindTuple:             {wireNode(reflection.KindTuple), 0},
	reflection.KindTupleMember:       {wireNode(reflection.KindTupleMember), wireNumber},
	reflection.KindEnumMember:        {wireNode(reflection.KindEnumMember), wireAll},
	reflection.KindRest:              {wireNode(reflection.KindRest), wireNumber},
	reflection.KindObjectLiteral:     {objectWithPropFixture, 0},
	reflection.KindIndexSignature:    {wireNode(reflection.KindIndexSignature), 0},
	reflection.KindPropertySignature: {wireNode(reflection.KindPropertySignature), wireNumber},
	reflection.KindMethodSignature:   {wireNode(reflection.KindMethodSignature), 0},
	reflection.KindInfer:             {wireNode(reflection.KindInfer), wireAll},
	reflection.KindCallSignature:     {wireNode(reflection.KindCallSignature), 0},
}

func literalFixture(value any, flags ...string) func() []*reflection.RunType {
	return func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindLiteral, Literal: value, Flags: flags}}
	}
}

func classFixture(subKind reflection.ReflectionSubKind, name string) func() []*reflection.RunType {
	return func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindClass, SubKind: subKind, TypeName: name}}
	}
}

func enumFixture(values ...any) func() []*reflection.RunType {
	return func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindEnum, Values: values}}
	}
}

func numberOrNullFixture() []*reflection.RunType {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	null := &reflection.RunType{ID: "nul", Kind: reflection.KindNull}
	members := []*reflection.RunType{makeRef("num"), makeRef("nul")}
	return []*reflection.RunType{num, null, {ID: "root", Kind: reflection.KindUnion, Children: members, SafeUnionChildren: members}}
}

func objectWithPropFixture() []*reflection.RunType {
	num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
	prop := &reflection.RunType{ID: "p", Kind: reflection.KindProperty, Name: "n", IsSafeName: true, Child: makeRef("num")}
	return []*reflection.RunType{num, prop, {ID: "root", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("p")}}}
}

func TestCompactWireClasses_EveryKindHasARow(t *testing.T) {
	for kind := reflection.KindNever; kind < 256; kind++ {
		if reflection.FamilyOf(kind) == reflection.FamilyUnknown {
			continue
		}
		row, ok := wireClassByKind[kind]
		if !ok {
			t.Errorf("kind %d has no row in wireClassByKind: say what its compact wire value can be", kind)
			continue
		}
		if got := wireClassesOfRoot(row.build()); got != row.want {
			t.Errorf("kind %d: compactWireClasses = %03b, want %03b", kind, got, row.want)
		}
	}
}

func TestCompactWireClasses_Rows(t *testing.T) {
	overridden := func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindString, Overrides: map[string]string{"compactForJson": "h"}}}
	}
	emptyObject := func() []*reflection.RunType {
		return []*reflection.RunType{{ID: "root", Kind: reflection.KindObjectLiteral}}
	}
	// `type Self = number | Self[]`: the revisit adds nothing.
	cyclic := func() []*reflection.RunType {
		num := &reflection.RunType{ID: "num", Kind: reflection.KindNumber}
		arr := &reflection.RunType{ID: "arr", Kind: reflection.KindArray, Child: makeRef("root")}
		members := []*reflection.RunType{makeRef("num"), makeRef("arr"), makeRef("root")}
		return []*reflection.RunType{num, arr, {ID: "root", Kind: reflection.KindUnion, Children: members, SafeUnionChildren: members}}
	}
	// A DataOnly-stripped member is never written, so `boolean | () => void` is boolean only.
	strippedMember := func() []*reflection.RunType {
		boolean := &reflection.RunType{ID: "bool", Kind: reflection.KindBoolean}
		fn := &reflection.RunType{ID: "fn", Kind: reflection.KindFunction}
		members := []*reflection.RunType{makeRef("bool"), makeRef("fn")}
		return []*reflection.RunType{boolean, fn, {ID: "root", Kind: reflection.KindUnion, Children: members, SafeUnionChildren: members}}
	}
	rows := map[string]wireClassRow{
		"user compactForJson override":   {overridden, wireAll},
		"named user class (serializer)":  {classFixture(reflection.SubKindNone, "User"), wireAll},
		"anonymous class (an array)":     {classFixture(reflection.SubKindNone, ""), 0},
		"Map (an array of pairs)":        {classFixture(reflection.SubKindMap, ""), 0},
		"numeric enum":                   {enumFixture(0.0, 1.0), wireNumber},
		"mixed enum":                     {enumFixture("a", 1.0), wireNumber},
		"string enum":                    {enumFixture("a", "b"), 0},
		"`0` literal":                    {literalFixture(0.0), wireNumber},
		"`true` literal":                 {literalFixture(true), wireBoolean},
		"`null` literal":                 {literalFixture(nil), wireNull},
		"bigint literal (a string)":      {literalFixture("1", "bigint"), 0},
		"`{}` admits any non-nullish":    {emptyObject, wireAll},
		"number | null":                  {numberOrNullFixture, wireNumber | wireNull},
		"cyclic union":                   {cyclic, wireNumber},
		"stripped union member is unset": {strippedMember, wireBoolean},
	}
	for name, row := range rows {
		if got := wireClassesOfRoot(row.build()); got != row.want {
			t.Errorf("%s: compactWireClasses = %03b, want %03b", name, got, row.want)
		}
	}
}

func TestFirstFreePlaceholder(t *testing.T) {
	rows := []struct {
		classes wireClasses
		want    string
		ok      bool
	}{
		{0, "0", true},
		{wireNull, "0", true},
		{wireNumber, "null", true},
		{wireNumber | wireBoolean, "null", true},
		{wireNumber | wireNull, "false", true},
		{wireAll, "", false},
	}
	for _, row := range rows {
		got, ok := firstFreePlaceholder(row.classes)
		if got != row.want || ok != row.ok {
			t.Errorf("firstFreePlaceholder(%03b) = %q, %v; want %q, %v", row.classes, got, ok, row.want, row.ok)
		}
	}
}

func TestMergedSlotPlaceholder(t *testing.T) {
	refTable := map[string]*reflection.RunType{
		"num": {ID: "num", Kind: reflection.KindNumber},
		"str": {ID: "str", Kind: reflection.KindString},
		"unk": {ID: "unk", Kind: reflection.KindUnknown},
	}
	ctx := &EmitContext{walker: &Walker{RefTable: refTable}}
	cand := func(id string, requiredSomewhere bool) FlatPropCandidate {
		return FlatPropCandidate{ChildRef: makeRef(id), Resolved: refTable[id], RequiredSomewhere: requiredSomewhere}
	}
	rows := map[string]struct {
		mp   FlatMergedProp
		want string
		ok   bool
	}{
		"required slot has none":            {FlatMergedProp{Required: true, Candidates: []FlatPropCandidate{cand("num", true)}}, "", true},
		"string slot":                       {FlatMergedProp{Candidates: []FlatPropCandidate{cand("str", true)}}, "0", true},
		"number slot":                       {FlatMergedProp{Candidates: []FlatPropCandidate{cand("num", false)}}, "null", true},
		"sub-wrapped slot is an array":      {FlatMergedProp{NeedsSubWrap: true, Candidates: []FlatPropCandidate{cand("num", true), cand("unk", true)}}, "0", true},
		"string or number (no sub-wrap)":    {FlatMergedProp{Candidates: []FlatPropCandidate{cand("str", false), cand("num", false)}}, "null", true},
		"optional-only unknown collapses":   {FlatMergedProp{Candidates: []FlatPropCandidate{cand("unk", false)}}, "null", true},
		"required unknown keeps keyed form": {FlatMergedProp{Candidates: []FlatPropCandidate{cand("unk", true)}}, "", false},
	}
	for name, row := range rows {
		got, ok := mergedSlotPlaceholder(row.mp, ctx)
		if got != row.want || ok != row.ok {
			t.Errorf("%s: mergedSlotPlaceholder = %q, %v; want %q, %v", name, got, ok, row.want, row.ok)
		}
	}
}
