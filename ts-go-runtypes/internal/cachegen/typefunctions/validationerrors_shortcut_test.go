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

// buildCircularNodeFixture builds `interface Node {a: string; next?: Node}`: its walk recurses unguarded, so it takes the shortcut.
func buildCircularNodeFixture() ([]*reflection.RunType, string) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pA", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	propN := &reflection.RunType{ID: "pN", Kind: reflection.KindPropertySignature, Name: "next", IsSafeName: true, Optional: true, Child: makeRef("nod")}
	node := &reflection.RunType{ID: "nod", Kind: reflection.KindObjectLiteral, TypeName: "Node", IsCircular: true, Children: []*reflection.RunType{makeRef("pA"), makeRef("pN")}}
	return []*reflection.RunType{str, propA, propN, node}, "nod"
}

// buildNamedChildFixture builds `{c: Inner}` with `interface Inner {a: string}`, a named child the walk dep-calls.
func buildNamedChildFixture() ([]*reflection.RunType, string) {
	str := &reflection.RunType{ID: "str", Kind: reflection.KindString}
	propA := &reflection.RunType{ID: "pA", Kind: reflection.KindPropertySignature, Name: "a", IsSafeName: true, Child: makeRef("str")}
	inner := &reflection.RunType{ID: "inn", Kind: reflection.KindObjectLiteral, TypeName: "Inner", Children: []*reflection.RunType{makeRef("pA")}}
	propC := &reflection.RunType{ID: "pC", Kind: reflection.KindPropertySignature, Name: "c", IsSafeName: true, Child: makeRef("inn")}
	outer := &reflection.RunType{ID: "out", Kind: reflection.KindObjectLiteral, Children: []*reflection.RunType{makeRef("pC")}}
	return []*reflection.RunType{str, propA, inner, propC, outer}, "out"
}

// TestValidationErrors_ShortcutAsksItsOwnValidator — a call with no `er` returns the validator's verdict first, and each
// error family asks the validator that accepts exactly what it reports nothing for.
func TestValidationErrors_ShortcutAsksItsOwnValidator(t *testing.T) {
	runTypes, rootID := buildCircularNodeFixture()
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

// TestValidationErrors_NoShortcutOnPlainChecks — a walk of plain checks runs as fast as the validator, so asking it first
// only adds its cost. The strict family keeps the shortcut: its unknown-key scan costs more than the validator's key count.
func TestValidationErrors_NoShortcutOnPlainChecks(t *testing.T) {
	runTypes, rootID := buildStringPropObjectFixture()
	rendered := renderErrorsEntry(t, runTypes, rootID, "validationErrors", ValidationErrorsEmitter{}, false)
	if !strings.Contains(rendered.argsText, "(v,pth,er){"+fillOnlyPrologue) || containsStr(rendered.crossFamilyDeps, valKey(rootID)) {
		t.Errorf("a plain-checks walk must skip the shortcut, got:\n%s", rendered.argsText)
	}
	strict := renderErrorsEntry(t, runTypes, rootID, "validationErrorsStrict", ValidationErrorsStrictEmitter{}, false)
	if !strings.Contains(strict.argsText, shortcutPrologue(operations.PlainHash("validateStrict")+"_"+rootID)) {
		t.Errorf("the unknown-key scan must keep the shortcut, got:\n%s", strict.argsText)
	}
}

// TestValidationErrors_ChildAsksItsValidator — a named child outside any cycle is walked only when its validator rejects
// it, and the root skips the shortcut since the guarded walk already costs one validate call per accepted subtree.
func TestValidationErrors_ChildAsksItsValidator(t *testing.T) {
	runTypes, rootID := buildNamedChildFixture()
	rendered := renderErrorsEntry(t, runTypes, rootID, "validationErrors", ValidationErrorsEmitter{}, false)
	childErr := innerPrefix(constants.CacheModules["validationErrors"]) + "inn"
	// argsText holds the body as a quoted JS string, so its quotes come escaped.
	want := "(" + valKey("inn") + ".fn(v.c)||(pth.push(\\'c\\')," + childErr + ".fn(v.c,pth,er),pth.pop()))"
	if !strings.Contains(rendered.argsText, want) {
		t.Errorf("the child call must ask %s first, want %s in:\n%s", valKey("inn"), want, rendered.argsText)
	}
	if !containsStr(rendered.crossFamilyDeps, valKey("inn")) || containsStr(rendered.crossFamilyDeps, valKey(rootID)) {
		t.Errorf("CrossFamilyDeps %v: want the child validator only", rendered.crossFamilyDeps)
	}
}

// TestValidationErrors_CyclicChildWalksUnguarded — a child's validator would re-check the subtree at every level of a deep
// cyclic value, so a self-call walks unguarded.
func TestValidationErrors_CyclicChildWalksUnguarded(t *testing.T) {
	runTypes, rootID := buildCircularNodeFixture()
	rendered := renderErrorsEntry(t, runTypes, rootID, "validationErrors", ValidationErrorsEmitter{}, false)
	if strings.Contains(rendered.argsText, valKey(rootID)+".fn(v.next)") {
		t.Errorf("the self-call must not ask the validator, got:\n%s", rendered.argsText)
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

// TestValidationErrors_OverriddenChildWalksUnguarded — an errors override is its own contract: the validator accepting a
// value says nothing about what the override reports, so neither the child guard nor the root shortcut may skip it.
func TestValidationErrors_OverriddenChildWalksUnguarded(t *testing.T) {
	runTypes, rootID := buildNamedChildFixture()
	for _, node := range runTypes {
		if node.ID == "inn" {
			node.Overrides = map[string]string{"validationErrors": "pf_userErrors"}
		}
	}
	rendered := renderErrorsEntry(t, runTypes, rootID, "validationErrors", ValidationErrorsEmitter{}, false)
	if strings.Contains(rendered.argsText, valKey("inn")) || strings.Contains(rendered.argsText, valKey(rootID)) {
		t.Errorf("an overridden child must reach no validator, got:\n%s", rendered.argsText)
	}
}
