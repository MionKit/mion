package convert_test

import (
	"reflect"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// The printers' slot-coverage contract — the print-side twin of
// TestCanonicalCoversRunType, and the tripwire the unevaluated* silent drop
// (docs/done/convert-drops-unevaluated.md) showed was missing: the C6
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
	"Flags":    "printed: rest and bigint discriminate spellings; symbol-keyed names refuse (isSymbolKeyedName)",

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

var printerDispositionByCheck = map[string]string{
	"Contains":     "printed: contains/minContains/maxContains parts (structuralParts); stacked checks refuse",
	"PatternProps": "printed: the patternProperties part (structuralParts)",
	"PropNames":    "printed: the propertyNames part (structuralParts); stacked checks refuse",
}

func TestPrintersCoverRunType(t *testing.T) {
	check := func(structType reflect.Type, dispositions map[string]string, compared map[string]bool) {
		seen := map[string]bool{}
		for index := 0; index < structType.NumField(); index++ {
			fieldName := structType.Field(index).Name
			seen[fieldName] = true
			disposition, classified := dispositions[fieldName]
			if !classified {
				t.Errorf("%s field %q has no printer disposition (print_coverage_test.go) — decide printed/refused/… before shipping it", structType.Name(), fieldName)
				continue
			}
			channel, _, wellFormed := strings.Cut(disposition, ": ")
			if !wellFormed || !printerChannels[channel] {
				t.Errorf("%s field %q: disposition %q must open with a known channel", structType.Name(), fieldName, disposition)
				continue
			}
			if compared[fieldName] && !comparedChannels[channel] {
				t.Errorf("%s field %q is COMPARED by the C6 projection but the printers classify it %q — compared information cannot be silently ignored", structType.Name(), fieldName, channel)
			}
		}
		for fieldName := range dispositions {
			if !seen[fieldName] {
				t.Errorf("printer disposition names %q, which is not a %s field", fieldName, structType.Name())
			}
		}
	}
	check(reflect.TypeOf(reflection.RunType{}), printerDispositionByField, canonicalCompared)
	check(reflect.TypeOf(reflection.SchemaChecks{}), printerDispositionByCheck, canonicalChecksCompared)
}
