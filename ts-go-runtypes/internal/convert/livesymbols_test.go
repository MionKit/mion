package convert_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
)

func TestChain_Enum(t *testing.T) {
	source := "export enum Color {Red, Green, Blue}\n" +
		"export type Paint = {color: Color; fallback?: Color};\n"
	// getRunType<Color>() rather than RT.enum(Color): the enum builder
	// carries the VALUE union, which reflects to a different graph (and id).
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<Color>()") {
		t.Errorf("enum reference should print getRunType<Color>():\n%s", builderForm)
	}
	if !strings.Contains(builderForm, "export enum Color {Red, Green, Blue}") {
		t.Errorf("the enum declaration itself stays untouched:\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "color: Color") {
		t.Errorf("type target should restore the enum name:\n%s", typeForm)
	}
}

func TestChain_StringEnum(t *testing.T) {
	source := "enum Status {Active = 'active', Done = 'done'}\n" +
		"export type Job = {status: Status};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "getRunType<Status>()") {
		t.Errorf("string enum should print getRunType<Status>():\n%s", builderForm)
	}
	convertAndCheckIDs(t, builderForm, convert.TargetType)
}

func TestEnumMember_NormalizesToLiteral(t *testing.T) {
	// A single enum-member type reference reflects as its literal VALUE (the
	// graph does not model member identity), so conversion normalizes
	// `Color.Red` to `0` — same structural id, logged normalization.
	source := "export enum Color {Red, Green, Blue}\n" +
		"export type Chosen = {pick: Color.Red};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.literal(0)") {
		t.Errorf("an enum-member reference normalizes to its literal value:\n%s", builderForm)
	}
}

func TestChain_UserClass(t *testing.T) {
	source := "export class User {\n  constructor(public name: string) {}\n}\n" +
		"export type Session = {user: User; backup?: User};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.classType(User)") {
		t.Errorf("class instance should print RT.classType(User):\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "user: User") {
		t.Errorf("type target should restore the class name:\n%s", typeForm)
	}
}

func TestChain_RegExpNative(t *testing.T) {
	source := "export type Matcher = {pattern: RegExp; flags: string};\n"
	builderForm := convertAndCheckIDs(t, source, convert.TargetBuilders)
	if !strings.Contains(builderForm, "RT.regexp()") {
		t.Errorf("RegExp should print RT.regexp():\n%s", builderForm)
	}
	typeForm := convertAndCheckIDs(t, builderForm, convert.TargetType)
	if !strings.Contains(typeForm, "pattern: RegExp") {
		t.Errorf("type target should print RegExp:\n%s", typeForm)
	}
}

func TestAliasedEnumImport_Refused(t *testing.T) {
	sources := map[string]string{
		"colors.ts": "export enum Color {Red, Green}\n",
		"main.ts":   "import {Color as Hue} from './colors.ts';\nexport type Paint = {color: Hue};\n",
	}
	_, diags := convertSetWithDiags(t, sources, convert.Options{Target: convert.TargetBuilders})
	foundScopeDiag := false
	for _, diagnostic := range diags {
		if diagnostic.Code == convert.CodeUnsupportedKind && strings.Contains(diagnostic.Message, "not in scope") {
			foundScopeDiag = true
		}
	}
	if !foundScopeDiag {
		t.Fatalf("expected the aliased-import scope refusal, got %+v", diags)
	}
}
