package convert_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The printers' slot-coverage contract — the print-side twin of
// TestCanonicalCoversRunType, and the tripwire the unevaluated* silent drop
// showed was missing: the C6
// projection forced every RunType field to be COMPARED or excluded, but
// nothing forced the printers to CONSUME or refuse what the comparison
// protects. A populated slot no printer read (the since-removed Unevaluated)
// vanished from every target, invisible to the roundtrip fuzz lane because
// the printers never emitted it either.
//
// Every field of reflection.RunType (and of the embedded SchemaChecks) must
// declare how the three printers treat it, `<channel>: <how>`:
//
//   - `printed:`     the printers spell it (or refuse its unprintable
//     configurations with a CNV diagnostic — e.g. stacked checks);
//   - `refused:`     no printed spelling exists; every printer reports a CNV
//     diagnostic when the slot carries anything;
//   - `byReference:` the slot only occurs on types printed as a LIVE NAME
//     (classes, enums), so the referenced declaration carries it verbatim;
//   - `recomputed:`  re-derived identically after conversion (from structure
//     or from the preserved id), so printing it would be redundant;
//   - `inert:`       the projection never populates it today; the entry must
//     flip to printed/refused the day it does — C6 compares it, so the fuzz
//     lane backs this up once a printed form can carry one;
//   - `derived:`     a derived pass's output over fields already classified
//     (canonical.go excludes it too);
//   - `authoring:`   alias/heritage trail the names table supersedes
//     (canonical.go excludes it too).
//
// The consistency rule with teeth: a field the C6 canonical projection
// COMPARES is information conversion must preserve, so it can never sit in
// the derived/authoring buckets here — it must be printed, refused,
// referenced, recomputed or (temporarily) inert. A new RunType field fails
// BOTH tripwires until both files decide.

var printerChannels = map[string]bool{
	"printed": true, "refused": true, "byReference": true,
	"recomputed": true, "inert": true, "derived": true, "authoring": true,
}

// The channels legal for a canonical-COMPARED field.
var comparedChannels = map[string]bool{
	"printed": true, "refused": true, "byReference": true,
	"recomputed": true, "inert": true,
}

var printerDispositionByField = map[string]string{
	// Identity and structure.
	"ID":       "recomputed: the structural hash — same printed structure, same id; printers use it as walk/reference plumbing only",
	"Kind":     "printed: the kind switch of every core",
	"SubKind":  "printed: Date/Map/Set/Temporal/RegExp dispatch inside KindClass",
	"Name":     "printed: member keys, tuple slot labels, parameter names",
	"Optional": "printed: member `?` / RT.optional / propMod / the schema `required` inversion",
	"Readonly": "printed: the readonly modifier / propMod / tsReadonly",
	"Literal":  "printed: literalValueText behind const/enum/RT.literal and literal types",
	"Flags":    "printed: rest and bigint discriminate spellings; symbol-keyed names refuse (reflection.IsSymbolKeyedName)",

	// Recursed slots.
	"Child":        "printed: array element / promise payload / member value, recursed",
	"Index":        "printed: index-signature keys via objectMembers (record/tsIndexes spellings)",
	"IndexT":       "printed: index-signature values via objectMembers",
	"Return":       "printed: function return, recursed",
	"Parameters":   "printed: parameter list, recursed (parameterListText / funcSlotForm / functionSchemaText)",
	"Children":     "printed: members / tuple slots / union arms, recursed",
	"Arguments":    "printed: Map/Set/Promise type arguments via nativeArguments",
	"TypeMeta":     "printed: the `base & {…}` intersection (type target), tsMeta (schema), type-argument escape (builders)",
	"SchemaChecks": "printed: classified per check field below",

	// Format machinery.
	"FormatAnnotation": "printed: leafFormat → TF brands / TypeFormat / TFT / rtFormat + rtFormatParams wire",

	// Refusals — no printed spelling exists, so carrying nodes report CNV001.
	"NonEnumerable": "refused: objectMembers — @nonEnumerable has no conversion spelling yet",
	"DefaultVal":    "refused: parameterListText — a parameter default has no conversion spelling yet (escapes re-enter it and refuse too)",

	// Carried by the live name a reference prints.
	"Visibility": "byReference: class members never print; the referenced class carries them",
	"IsAbstract": "byReference: same — the live class name is the spelling",
	"IsStatic":   "byReference: same — the live class name is the spelling",
	"EnumVal":    "byReference: enums print their live name (enumSpelling); member names/values ride the referenced declaration",
	"Values":     "byReference: same enum node — the value list rides the referenced declaration",
	"ClassRef":   "byReference: classSpelling/liveSymbolName print the referenced constructor name; imports are managed",

	// Recomputed after conversion.
	"Overrides": "recomputed: registered at runtime keyed by the type id; conversion preserves the id, so the next resolve reattaches them",

	// Not populated by the projection today.
	"Description": "inert: reserved (v2) and never populated yet; populating it must come with printer carriage in the same change",

	// Derived passes' output (canonical.go excludes these too).
	"IsCircular":          "derived: cycle plumbing (the printers track cycles via the walk path); recomputed by the next resolve",
	"NotSupported":        "derived: recomputed by the next resolve",
	"Family":              "derived: recomputed by the next resolve",
	"IsSafeName":          "derived: a function of Name, which is printed",
	"Position":            "derived: the parent slice order carries it",
	"SafeUnionChildren":   "derived: serialize-time derivation of Children",
	"UnionDiscriminators": "derived: serialize-time derivation of Children",

	// Authoring trail the names table supersedes.
	"TypeName":         "authoring: declaration names print from the run's names table, never from the node",
	"TypeArguments":    "authoring: the alias trail's arguments; structure already expanded into the compared slots",
	"Extends":          "authoring: heritage — the checker already merged members into Children",
	"ExtendsArguments": "authoring: same",
	"Implements":       "authoring: same",
}

// declarationDispositionByField overrides printerDispositionByField for the declaration printer, which prints
// classes and enums in full instead of by name. Its oracle is the type id (assertDeclIDs, the api-types Check),
// so `notInID:` marks a field it leaves out because the id leaves it out.
var declarationDispositionByField = map[string]string{
	"NonEnumerable": "printed: the `/** @nonEnumerable */` tag (flagsNonEnumerableTag)",
	"Visibility":    "printed: classModifiers spells private / protected; a typeless private member prints `private x`",
	"IsAbstract":    "printed: classModifiers and the `abstract class` head",
	"IsStatic":      "notInID: objectMembers leaves static members out, as the class id does",
	"EnumVal":       "printed: expandEnumDecl prints every member and its value",
	"Values":        "printed: the same values expandEnumDecl prints from EnumVal",
	"ClassRef":      "printed: expandClassDecl's class name; a platform class spells through builtinRef",
	"TypeName":      "printed: the class, enum and recursive alias names, which a class or enum id includes",
	"IsCircular":    "derived: read by isRecursiveShape to print a recursive shape once, as a named alias",
}

var printerDispositionByCheck = map[string]string{
	"Contains":     "printed: contains/minContains/maxContains parts (structuralParts); stacked checks refuse",
	"PatternProps": "printed: the patternProperties part (structuralParts)",
	"PropNames":    "printed: the propertyNames part (structuralParts); stacked checks refuse",
}

func TestPrintersCoverRunType(t *testing.T) {
	check := func(table string, structType reflect.Type, dispositions map[string]string, compared map[string]bool, channels, legalCompared map[string]bool) {
		seen := map[string]bool{}
		for index := 0; index < structType.NumField(); index++ {
			fieldName := structType.Field(index).Name
			seen[fieldName] = true
			disposition, classified := dispositions[fieldName]
			if !classified {
				t.Errorf("%s: %s field %q has no printer disposition (print_coverage_test.go) — decide printed/refused/… before shipping it", table, structType.Name(), fieldName)
				continue
			}
			channel, _, wellFormed := strings.Cut(disposition, ": ")
			if !wellFormed || !channels[channel] {
				t.Errorf("%s: %s field %q: disposition %q must open with a known channel", table, structType.Name(), fieldName, disposition)
				continue
			}
			if compared[fieldName] && !legalCompared[channel] {
				t.Errorf("%s: %s field %q is COMPARED by the C6 projection but the printers classify it %q — compared information cannot be silently ignored", table, structType.Name(), fieldName, channel)
			}
		}
		for fieldName := range dispositions {
			if !seen[fieldName] {
				t.Errorf("%s: printer disposition names %q, which is not a %s field", table, fieldName, structType.Name())
			}
		}
	}
	runType := reflect.TypeOf(reflection.RunType{})
	check("convert", runType, printerDispositionByField, canonicalCompared, printerChannels, comparedChannels)
	check("convert", reflect.TypeOf(reflection.SchemaChecks{}), printerDispositionByCheck, canonicalChecksCompared, printerChannels, comparedChannels)
	declaration := map[string]string{}
	for fieldName, disposition := range printerDispositionByField {
		declaration[fieldName] = disposition
	}
	for fieldName, disposition := range declarationDispositionByField {
		if declaration[fieldName] == disposition {
			t.Errorf("declaration disposition of %q repeats the base table; drop the override", fieldName)
		}
		declaration[fieldName] = disposition
	}
	withNotInID := map[string]bool{"notInID": true}
	for channel := range printerChannels {
		withNotInID[channel] = true
	}
	legalDeclared := map[string]bool{"notInID": true}
	for channel := range comparedChannels {
		legalDeclared[channel] = true
	}
	check("declaration", runType, declaration, canonicalCompared, withNotInID, legalDeclared)
}

// printerKindArms says which printer arm spells each kind and builds the smallest node that reaches it; a nil build
// marks a kind the printers refuse. A new kind fails TestPrinters_EveryKindHasAnArm until it has a row.
var printerKindArms = map[reflection.ReflectionKind]struct {
	arm   string
	build func() *reflection.RunType
}{
	reflection.KindNever:     {"type switch", nil},
	reflection.KindAny:       {"type switch", nil},
	reflection.KindUnknown:   {"type switch", nil},
	reflection.KindVoid:      {"type switch", nil},
	reflection.KindObject:    {"type switch", nil},
	reflection.KindString:    {"type switch", nil},
	reflection.KindNumber:    {"type switch", nil},
	reflection.KindBoolean:   {"type switch", nil},
	reflection.KindSymbol:    {"type switch", nil},
	reflection.KindBigInt:    {"type switch", nil},
	reflection.KindNull:      {"type switch", nil},
	reflection.KindUndefined: {"type switch", nil},
	reflection.KindRegexp:    {"type switch", nil},
	reflection.KindFunction:  {"type switch", nil},
	reflection.KindLiteral: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "lit", Kind: reflection.KindLiteral, Literal: "a"}
	}},
	reflection.KindTemplateLiteral: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "tpl", Kind: reflection.KindTemplateLiteral,
			Literal: map[string]any{"templateLiteral": map[string]any{"texts": []any{"a"}, "placeholders": []any{}}}}
	}},
	reflection.KindPromise: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "promise", Kind: reflection.KindPromise, Child: kindArmString()}
	}},
	reflection.KindClass: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "class", Kind: reflection.KindClass, TypeName: "Box", ClassRef: &reflection.ClassRef{Name: "Box"}}
	}},
	reflection.KindEnum: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "enum", Kind: reflection.KindEnum, TypeName: "Color", EnumVal: map[string]any{"Red": "red"}}
	}},
	reflection.KindUnion: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "union", Kind: reflection.KindUnion,
			Children: []*reflection.RunType{kindArmString(), {ID: "num", Kind: reflection.KindNumber}}}
	}},
	reflection.KindArray: {"type switch", func() *reflection.RunType {
		return &reflection.RunType{ID: "array", Kind: reflection.KindArray, Child: kindArmString()}
	}},
	reflection.KindObjectLiteral: {"type switch", func() *reflection.RunType { return kindArmObject(reflection.KindProperty) }},
	reflection.KindTuple:         {"type switch", func() *reflection.RunType { return kindArmTuple() }},
	reflection.KindTupleMember:   {"tuple members (tupleMembers)", func() *reflection.RunType { return kindArmTuple() }},
	reflection.KindParameter: {"parameter list (parameterListText)", func() *reflection.RunType {
		return &reflection.RunType{ID: "fn", Kind: reflection.KindFunction,
			Parameters: []*reflection.RunType{{ID: "param", Kind: reflection.KindParameter, Name: "value", Child: kindArmString()}}}
	}},
	reflection.KindProperty:          {"member printer (objectMembers)", func() *reflection.RunType { return kindArmObject(reflection.KindProperty) }},
	reflection.KindPropertySignature: {"member printer (objectMembers)", func() *reflection.RunType { return kindArmObject(reflection.KindPropertySignature) }},
	reflection.KindMethod:            {"member printer (objectMembers)", func() *reflection.RunType { return kindArmObject(reflection.KindMethod) }},
	reflection.KindMethodSignature:   {"member printer (objectMembers)", func() *reflection.RunType { return kindArmObject(reflection.KindMethodSignature) }},
	reflection.KindCallSignature:     {"member printer (objectMembers)", func() *reflection.RunType { return kindArmObject(reflection.KindCallSignature) }},
	reflection.KindIndexSignature: {"member printer (objectMembers)", func() *reflection.RunType {
		return &reflection.RunType{ID: "indexed", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{
			{ID: "index", Kind: reflection.KindIndexSignature, Index: kindArmString(), Child: kindArmString()}}}
	}},
	// Refused: the serializer never hands these to a printer.
	reflection.KindIntersection: {"refused: the serializer collapses every intersection", nil},
	reflection.KindEnumMember:   {"refused: a member reference is an enum node with an enumMember flag", nil},
	reflection.KindRest:         {"refused: a rest element is a tuple member or parameter flagged rest", nil},
}

func kindArmString() *reflection.RunType {
	return &reflection.RunType{ID: "str", Kind: reflection.KindString}
}

func kindArmObject(memberKind reflection.ReflectionKind) *reflection.RunType {
	member := &reflection.RunType{ID: "member", Kind: memberKind, Name: "value", IsSafeName: true}
	if memberKind == reflection.KindProperty || memberKind == reflection.KindPropertySignature {
		member.Child = kindArmString()
	}
	return &reflection.RunType{ID: "object", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{member}}
}

func kindArmTuple() *reflection.RunType {
	return &reflection.RunType{ID: "tuple", Kind: reflection.KindTuple,
		Children: []*reflection.RunType{{ID: "slot", Kind: reflection.KindTupleMember, Child: kindArmString()}}}
}

// TestPrinters_EveryKindHasAnArm: every kind prints through a named arm, or is refused with a CNV diagnostic.
func TestPrinters_EveryKindHasAnArm(t *testing.T) {
	for kind := reflection.KindNever; kind < 256; kind++ {
		if reflection.FamilyOf(kind) == reflection.FamilyUnknown {
			continue
		}
		row, ok := printerKindArms[kind]
		if !ok {
			t.Errorf("kind %d has no row in printerKindArms: say which printer arm spells it, or refuse it", kind)
			continue
		}
		refused := strings.HasPrefix(row.arm, "refused:")
		build := row.build
		if build == nil {
			build = func() *reflection.RunType { return &reflection.RunType{ID: "bare", Kind: kind} }
		}
		printer := convert.NewDeclPrinter(func(string) *reflection.RunType { return nil })
		text, err := printer.TypeToString(build())
		switch {
		case refused && err == nil:
			t.Errorf("kind %d is marked refused but printed %q", kind, text)
		case refused && !strings.Contains(err.Error(), "is not convertible yet"):
			t.Errorf("kind %d is refused with %q, not the unsupported-kind diagnostic", kind, err)
		case !refused && err != nil:
			t.Errorf("kind %d (%s) does not print: %v", kind, row.arm, err)
		}
	}
}
