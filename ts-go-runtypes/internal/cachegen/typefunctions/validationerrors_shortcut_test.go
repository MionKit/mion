package typefunctions

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/operations"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

const fillOnlyPrologue = "if(er===undefined)er=[];if(pth===undefined)pth=[];"

func shortcutPrologue(validateKey string) string {
	return "if(er===undefined){er=[];if(" + validateKey + ".fn(v))return er;}if(pth===undefined)pth=[];"
}

func renderErrorsEntry(t *testing.T, runTypes []*reflection.RunType, rootID, family string, emitter Emitter, rejectCircular bool) entryRender {
	t.Helper()
	refTable := buildRefTable(runTypes)
	settings := constants.CacheModules[family]
	rendered := renderEntryWithDeps(refTable[rootID], settings, emitter, innerPrefix(settings), refTable, RenderOpts{}, "", nil, rejectCircular)
	if rendered.argsText == "" {
		t.Fatalf("%s: empty entry for %s", family, rootID)
	}
	return rendered
}

// TestValidationErrors_ShortcutAsksItsOwnValidator — a call with no `er` returns the validator's verdict first, and each
// error family asks the validator that accepts exactly what it reports nothing for.
func TestValidationErrors_ShortcutAsksItsOwnValidator(t *testing.T) {
	runTypes, rootID := buildStringPropObjectFixture()
	for _, tc := range []struct {
		family    string
		emitter   Emitter
		validator string
	}{
		{"validationErrors", ValidationErrorsEmitter{}, "validate"},
		{"validationErrorsStrict", ValidationErrorsStrictEmitter{}, "validateStrict"},
		{"validationErrorsUnionKeys", ValidationErrorsUnionKeysEmitter{}, "validateUnionKeys"},
	} {
		t.Run(tc.family, func(t *testing.T) {
			rendered := renderErrorsEntry(t, runTypes, rootID, tc.family, tc.emitter, false)
			want := operations.PlainHash(tc.validator) + "_" + rootID
			if !strings.Contains(rendered.argsText, "(v,pth,er){"+shortcutPrologue(want)) {
				t.Errorf("body must open with the %s shortcut, got:\n%s", tc.validator, rendered.argsText)
			}
			if !containsStr(rendered.crossFamilyDeps, want) {
				t.Errorf("CrossFamilyDeps %v missing the shortcut's validator %q", rendered.crossFamilyDeps, want)
			}
		})
	}
}

// TestValidationErrors_NoShortcutOverNonData — a non-data node makes the validator report and throw its own code, so the
// errors function keeps the full walk and reaches no validator.
func TestValidationErrors_NoShortcutOverNonData(t *testing.T) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	fn := &reflection.RunType{ID: "fnc", Kind: reflection.KindFunction}
	propA := &reflection.RunType{ID: "pA", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propF := &reflection.RunType{ID: "pF", Kind: reflection.KindPropertySignature, Name: "f", IsSafeName: true, Optional: true, Child: makeRef("fnc")}
	inner := &reflection.RunType{ID: "inn", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pA"), makeRef("pF")}}
	propI := &reflection.RunType{ID: "pI", Kind: reflection.KindPropertySignature, Name: "i", IsSafeName: true, Child: makeRef("inn")}
	outer := &reflection.RunType{ID: "out", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pI")}}
	rendered := renderErrorsEntry(t, []*reflection.RunType{str, fn, propA, propF, inner, propI, outer}, "out", "validationErrors", ValidationErrorsEmitter{}, false)
	if !strings.Contains(rendered.argsText, "(v,pth,er){"+fillOnlyPrologue) {
		t.Errorf("a nested non-data node must keep the shortcut off, got:\n%s", rendered.argsText)
	}
	if containsStr(rendered.crossFamilyDeps, valKey("out")) {
		t.Errorf("no validator lookup expected, got %v", rendered.crossFamilyDeps)
	}
}

// TestValidationErrors_NoShortcutUnderCircularGuard — the plain validator recurses forever on a cycle, so the armed variant
// fills its args ahead of the guard and never asks it.
func TestValidationErrors_NoShortcutUnderCircularGuard(t *testing.T) {
	runTypes, rootID := buildStringPropObjectFixture()
	rendered := renderErrorsEntry(t, runTypes, rootID, "validationErrors", ValidationErrorsEmitter{}, true)
	if containsStr(rendered.crossFamilyDeps, valKey(rootID)) || strings.Contains(rendered.argsText, valKey(rootID)) {
		t.Errorf("the armed variant must not reach the validator, got:\n%s", rendered.argsText)
	}
}

// TestValidationErrors_ShortcutOnlyOnContainerRoots — a one-check root (atomic, Date, Temporal, union) gains nothing on an
// accepted value and pays twice on a rejected one, so only container roots take the shortcut.
func TestValidationErrors_ShortcutOnlyOnContainerRoots(t *testing.T) {
	for _, tc := range []struct {
		name string
		root *reflection.RunType
		want bool
	}{
		{"objectLiteral", &reflection.RunType{Kind: reflection.KindObjectLiteral}, true},
		{"array", &reflection.RunType{Kind: reflection.KindArray}, true},
		{"tuple", &reflection.RunType{Kind: reflection.KindTuple}, true},
		{"intersection", &reflection.RunType{Kind: reflection.KindIntersection}, true},
		{"class", &reflection.RunType{Kind: reflection.KindClass}, true},
		{"map", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindMap}, true},
		{"set", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindSet}, true},
		{"date", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindDate}, false},
		{"temporal", &reflection.RunType{Kind: reflection.KindClass, SubKind: reflection.SubKindTemporalPlainDate}, false},
		{"string", &reflection.RunType{Kind: reflection.KindString}, false},
		{"union", &reflection.RunType{Kind: reflection.KindUnion}, false},
		{"object", &reflection.RunType{Kind: reflection.KindObject}, false},
	} {
		if got := shortcutPaysOff(tc.root); got != tc.want {
			t.Errorf("%s: shortcutPaysOff = %v, want %v", tc.name, got, tc.want)
		}
	}
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	rendered := renderErrorsEntry(t, []*reflection.RunType{str}, "str", "validationErrors", ValidationErrorsEmitter{}, false)
	if !strings.Contains(rendered.argsText, "(v,pth,er){"+fillOnlyPrologue) || containsStr(rendered.crossFamilyDeps, valKey("str")) {
		t.Errorf("a string root must keep the full walk and reach no validator, got:\n%s", rendered.argsText)
	}
}
