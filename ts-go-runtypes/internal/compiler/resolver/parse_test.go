package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
)

// Resolver coverage for createParseFn. A parse body walks nothing itself: it
// composes the families that already exist, so what these pin is WHICH pieces
// each strategy calls and that the walk really is gone.

// Loose is the default: no strip pre-pass, no key check. The negative half is
// the point — a default site must not drag in the other two families.
func TestParse_DefaultsToTheLooseFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const parseUser = createParseFn<User>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "parse")); !ok {
		t.Fatalf("no parse entry emitted\nmodules: %v", keys(modules))
	}
	for _, other := range []string{"parseFail", "parseStrip"} {
		if _, ok := findEntryWith(modules, familyPrefix(t, other)); ok {
			t.Fatalf("default call site emitted a %s entry\nmodules: %v", other, keys(modules))
		}
	}
}

func TestParse_StrategySelectsTheFamily(t *testing.T) {
	for _, row := range []struct{ strategy, opName string }{
		{"preserve", "parse"},
		{"strip", "parseStrip"},
		{"fail", "parseFail"},
	} {
		t.Run(row.strategy, func(t *testing.T) {
			modules := scanEntryModules(t, `import {createParseFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const parseUser = createParseFn<User>(undefined, {strategy: '`+row.strategy+`'});
`)
			if _, ok := findEntryWith(modules, familyPrefix(t, row.opName)); !ok {
				t.Fatalf("strategy %q did not select %s\nmodules: %v", row.strategy, row.opName, keys(modules))
			}
		})
	}
}

// The factory resolves TWO tuples: the parse body, and the validationErrors
// entry it builds the report from on failure. A site missing the second would
// throw with an empty report.
func TestParse_DemandsTheValidationErrorsEntry(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const parseUser = createParseFn<User>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "validationErrors")); !ok {
		t.Fatalf("parse site did not demand the validationErrors entry its cold path needs\nmodules: %v", keys(modules))
	}
}

// parseBody returns the emitted factory source for one strategy over one type.
func parseBody(t *testing.T, opName string, src string) string {
	t.Helper()
	modules := scanEntryModules(t, src)
	name, ok := findEntryForType(modules, familyPrefix(t, opName), "T")
	if !ok {
		t.Fatalf("no %s entry emitted for T\nmodules: %v", opName, keys(modules))
	}
	return modules[name]
}

const parseSrcNothingToRestore = `import {createParseFn} from '@mionjs/run-types';
interface T {id: string; inner: {a: number}}
export const parseT = createParseFn<T>(undefined, {strategy: 'STRATEGY'});
`

const parseSrcRestoring = `import {createParseFn} from '@mionjs/run-types';
interface T {id: string; at: Date}
export const parseT = createParseFn<T>(undefined, {strategy: 'STRATEGY'});
`

func srcFor(template string, strategy string) string {
	return strings.Replace(template, "STRATEGY", strategy, 1)
}

// The load-bearing property of the whole design: the body composes calls and
// does NOT walk the value. If a property accessor shows up here, someone has
// re-grown the per-node walk that measured at 0.46x of a plain validate.
func TestParse_BodyComposesRatherThanWalks(t *testing.T) {
	body := parseBody(t, "parse", srcFor(parseSrcNothingToRestore, "preserve"))
	if strings.Contains(body, "inner.a") || strings.Contains(body, "typeof v.id") {
		t.Errorf("parse body walks the value instead of composing families:\n%s", body)
	}
	if !strings.Contains(body, familyPrefix(t, "validate")) {
		t.Errorf("parse body does not call the validate entry:\n%s", body)
	}
}

// Nothing to restore means no restore call at all — not a call to an entry that
// happens to be empty. The elision is what keeps loose parse at parity with a
// bare validate.
func TestParse_OmitsTheRestoreCallWhenNothingRestores(t *testing.T) {
	body := parseBody(t, "parse", srcFor(parseSrcNothingToRestore, "preserve"))
	if strings.Contains(body, familyPrefix(t, "restoreFromJson")) {
		t.Errorf("emitted a restore call for a type with nothing to restore:\n%s", body)
	}
	if strings.Contains(body, "try{") {
		t.Errorf("emitted a try wrapper with no restore call to guard:\n%s", body)
	}
}

// A Date DOES need restoring, and restoreFromJson throws RAW on malformed input
// (BigInt('nope') is a SyntaxError, the RegExp arm indexes a null match). The
// wrap is what makes parse total, so it is pinned together with the call.
func TestParse_WrapsTheRestoreCall(t *testing.T) {
	body := parseBody(t, "parse", srcFor(parseSrcRestoring, "preserve"))
	if !strings.Contains(body, familyPrefix(t, "restoreFromJson")) {
		t.Fatalf("a restoring type emitted no restore call:\n%s", body)
	}
	if !strings.Contains(body, "try{") || !strings.Contains(body, "catch(e){") {
		t.Errorf("the restore call is not wrapped — a raw SyntaxError would escape parse:\n%s", body)
	}
	// The caught error is FORWARDED as the mismatch's cause. Without it the only
	// account of a decode failure is the report rebuilt from the half-restored
	// value, and for a union that report can come back empty (see RTParseError).
	if !strings.Contains(body, "catch(e){throw utl.parseMismatch(v,e)}") {
		t.Errorf("the restore throw is swallowed instead of forwarded as cause:\n%s", body)
	}
}

// fail routes through the FUSED validate{checkUnknowns} entry rather than
// validate plus a separate key scan, so the strict strategy costs one call like
// the other two.
func TestParse_FailChecksThroughTheFusedValidator(t *testing.T) {
	body := parseBody(t, "parseFail", srcFor(parseSrcNothingToRestore, "fail"))
	if !strings.Contains(body, familyPrefix(t, "validateStrict")) {
		t.Errorf("fail did not check through the fused validateStrict entry:\n%s", body)
	}
}

// strip blanks undeclared keys with the ukuw pre-pass BEFORE the restore walks
// the declared shape — the same two-step the `strip` JSON decoder uses.
func TestParse_StripRunsTheUnknownKeyPrePass(t *testing.T) {
	body := parseBody(t, "parseStrip", srcFor(parseSrcNothingToRestore, "strip"))
	stripPrefix := familyPrefix(t, "unknownKeysToUndefinedWire")
	if !strings.Contains(body, stripPrefix) {
		t.Fatalf("strip emitted no ukuw pre-pass:\n%s", body)
	}
	// Order matters: blanking after the check would validate the extras. Compare
	// inside the FUNCTION only — the import block above it lists entries in its
	// own order and says nothing about when they run.
	fnBody := body[strings.Index(body, "function "):]
	if strings.Index(fnBody, stripPrefix) > strings.Index(fnBody, familyPrefix(t, "validate")) {
		t.Errorf("the ukuw pre-pass runs after the check instead of before it:\n%s", fnBody)
	}
}

// Failure is signalled by a throw, never a status holder: the return value is
// the restored data, so there is nowhere else to put the verdict.
func TestParse_SignalsFailureByThrowing(t *testing.T) {
	body := parseBody(t, "parse", srcFor(parseSrcNothingToRestore, "preserve"))
	if !strings.Contains(body, "utl.parseMismatch") {
		t.Errorf("parse body does not throw the mismatch signal:\n%s", body)
	}
	if strings.Contains(body, "st.ok") {
		t.Errorf("parse body still threads a status holder:\n%s", body)
	}
}

// Marker test coverage rule (ts-go-runtypes/CLAUDE.md): both getRunTypeId call
// shapes, paired, with one hash-equivalence assertion.

func TestParse_MarkerStaticForm(t *testing.T) {
	r := setupInline(t, map[string]string{"static.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface Payload {id: number; at: Date}
export const id = getRunTypeId<Payload>();
`})
	if resolved := resolveFile(t, r, "static.ts"); resolved.ID == "" {
		t.Fatalf("static getRunTypeId<Payload>() resolved no id")
	}
}

func TestParse_MarkerReflectForm(t *testing.T) {
	r := setupInline(t, map[string]string{"reflect.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface Payload {id: number; at: Date}
const v: Payload = {id: 1, at: new Date()};
export const id = getRunTypeId(v);
`})
	if resolved := resolveFile(t, r, "reflect.ts"); resolved.ID == "" {
		t.Fatalf("reflect getRunTypeId(v) resolved no id")
	}
}

func TestParse_MarkerFormEquivalence(t *testing.T) {
	r := setupInline(t, map[string]string{
		"static.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface Payload {id: number; at: Date}
export const id = getRunTypeId<Payload>();
`,
		"reflect.ts": `import {getRunTypeId} from '@mionjs/run-types';
interface Payload {id: number; at: Date}
const v: Payload = {id: 1, at: new Date()};
export const id = getRunTypeId(v);
`,
	})
	static := resolveFile(t, r, "static.ts")
	reflect := resolveFile(t, r, "reflect.ts")
	if static.ID != reflect.ID {
		t.Fatalf("static vs reflect form of Payload disagree: %q vs %q", static.ID, reflect.ID)
	}
}

// The parse families are independent of the JSON decoder: a parse site must not
// drag in a jsonDecoder composite, and vice versa.
func TestParse_DoesNotDemandTheJsonDecoder(t *testing.T) {
	modules := scanEntryModules(t, `import {createParseFn} from '@mionjs/run-types';
interface User {id: number}
export const parseUser = createParseFn<User>();
`)
	op, ok := operations.ByName("jsonDecoder")
	if !ok {
		t.Fatalf("jsonDecoder operation missing from the registry")
	}
	decoderHash := operations.FnHashFor(op, nil, "strip", false) + "_"
	if _, found := findEntryWith(modules, decoderHash); found {
		t.Errorf("parse site pulled in a jsonDecoder composite\nmodules: %v", keys(modules))
	}
}
