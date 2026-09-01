package convert_test

import (
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/convert"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Call-site conversion (internal/convert/callsites.go): the type argument of a
// marker call is rewritten into the value argument the same factory already
// accepts, and back. The oracle is the SITE id — `createValidateFn<T>()` and
// `createValidateFn(<builder for T>)` reflect the same T, so a conversion that
// moves any id is wrong no matter how the source reads.

// siteIDs scans one source through the real resolver and returns the DISTINCT
// reflected ids of its marker sites, sorted.
//
// Distinct, not a multiset, and that is the whole subtlety: the value form
// carries MORE sites than the type form, because every builder call
// (`RT.object(…)`) is itself a marker site. A conversion adds sites; what it
// must never do is lose an id or invent one. The set is exactly that
// invariant.
func siteIDs(t testing.TB, source string) []string {
	t.Helper()
	_, session, cwd := setupConvert(t, map[string]string{"main.ts": source})
	defer session.Close()
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{tspath.ResolvePath(cwd, "main.ts")}})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	seen := map[string]bool{}
	var ids []string
	for _, site := range response.Sites {
		if !seen[site.ID] {
			seen[site.ID] = true
			ids = append(ids, site.ID)
		}
	}
	sort.Strings(ids)
	return ids
}

func assertSameIDs(t *testing.T, label string, before, after []string) {
	t.Helper()
	if strings.Join(before, " ") != strings.Join(after, " ") {
		t.Fatalf("%s: the reflected id set moved\n  before: %v\n  after:  %v", label, before, after)
	}
}

// The full shape matrix in one fixture, converted through every leg. Each entry
// is a distinct rule: the plain call converts, options survive without their
// placeholder, a NAMED type argument is left to the declaration pass, and the
// reflection form (a runtime value, not a type argument) is never touched.
const callSiteMatrix = `import {createValidateFn, getRunTypeId, type DataOnly} from '@mionjs/run-types';
export const isUser = createValidateFn<{id: string; age?: number}>();
export const withOpts = createValidateFn<{a: string}>(undefined, {strict: true});
interface Named {id: string}
export const isNamed = createValidateFn<Named>();
declare const sample: {id: string};
export const reflected = createValidateFn(sample);
export const dataOnly = createValidateFn<DataOnly<{a: string; run: () => void}>>();
`

func TestCallSites_EveryLegKeepsEveryID(t *testing.T) {
	baseline := siteIDs(t, callSiteMatrix)
	buildersForm, diags := convertOne(t, callSiteMatrix, convert.Options{Target: convert.TargetBuilders})
	if len(diags) > 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	assertSameIDs(t, "--to builders", baseline, siteIDs(t, buildersForm))

	typeForm, typeDiags := convertOne(t, buildersForm, convert.Options{Target: convert.TargetType})
	if len(typeDiags) > 0 {
		t.Fatalf("unexpected diagnostics: %+v", typeDiags)
	}
	assertSameIDs(t, "--to type", baseline, siteIDs(t, typeForm))

	// The type form is the fixpoint: a second pass is a byte no-op.
	if again, _ := convertOne(t, typeForm, convert.Options{Target: convert.TargetType}); again != typeForm {
		t.Errorf("type target is not a fixpoint:\n%s\n---\n%s", typeForm, again)
	}
}

func TestCallSites_RewritesOnlyWhatItShould(t *testing.T) {
	buildersForm, _ := convertOne(t, callSiteMatrix, convert.Options{Target: convert.TargetBuilders})
	for _, wants := range []string{
		// The inline type argument became the value argument.
		"export const isUser = createValidateFn(RT.object({id: TF.string(), age: RT.optional(TF.number())}));",
		// Options survive and the `undefined` placeholder is gone — the
		// value-first overload takes the runtype in that slot.
		"export const withOpts = createValidateFn(RT.object({a: TF.string()}), {strict: true});",
		// A NAMED type argument is the declaration pass's job; the call keeps
		// the name and the declaration converts under it.
		"export const isNamed = createValidateFn<Named>();",
		// The REFLECTION form passes a runtime value, not a type — untouched.
		"export const reflected = createValidateFn(sample);",
	} {
		if !strings.Contains(buildersForm, wants) {
			t.Errorf("expected %q in:\n%s", wants, buildersForm)
		}
	}
}

func TestCallSites_OptionsPlaceholderComesBack(t *testing.T) {
	// Round-tripping options is asymmetric: the value-first overload takes the
	// runtype in slot 0, the type-first one takes a value there, so converting
	// back has to reinstate `undefined` or the options land in the wrong slot.
	source := "import {createValidateFn} from '@mionjs/run-types';\n" +
		"export const strict = createValidateFn<{a: string}>(undefined, {strict: true});\n"
	buildersForm := convertOneOK(t, source, convert.TargetBuilders)
	typeForm := convertOneOK(t, buildersForm, convert.TargetType)
	if !strings.Contains(typeForm, "createValidateFn<{a: string}>(undefined, {strict: true})") {
		t.Errorf("the options placeholder did not come back:\n%s", typeForm)
	}
}

func TestCallSites_BothMarkerShapesConverge(t *testing.T) {
	// The Marker test coverage rule at a call site: the STATIC shape converts,
	// the REFLECTION shape does not, and both keep resolving to the same id for
	// the same T — before and after.
	source := "import {getRunTypeId} from '@mionjs/run-types';\n" +
		"interface Point {x: number; y: number}\n" +
		"export const staticId = getRunTypeId<{x: number; y: number}>();\n" +
		"declare const point: Point;\n" +
		"export const valueId = getRunTypeId(point);\n"
	before := siteIDs(t, source)
	// ONE distinct id across both shapes is the hash-equivalence assertion: the
	// static and reflection forms of the same T are the same type.
	if len(before) != 1 {
		t.Fatalf("the two marker shapes should resolve to ONE id for equivalent T, got %v", before)
	}
	buildersForm := convertOneOK(t, source, convert.TargetBuilders)
	// The inline type is STRUCTURALLY the named one, so the printer spells the
	// reference rather than re-inlining the shape — the same policy a
	// declaration reference gets, and the reason the id cannot move.
	if !strings.Contains(buildersForm, "getRunTypeId(getRunType<Point>())") {
		t.Errorf("the static shape should convert:\n%s", buildersForm)
	}
	if !strings.Contains(buildersForm, "getRunTypeId(point)") {
		t.Errorf("the reflection shape must survive verbatim:\n%s", buildersForm)
	}
	// Still one id afterwards — the converted static site, the reflection site
	// and the builder const all reflect the same Point.
	assertSameIDs(t, "both marker shapes", before, siteIDs(t, buildersForm))
}

func TestCallSites_DataOnlyResolvesToItsProjection(t *testing.T) {
	// `DataOnly<T>` is a projection, so the value form spells the PROJECTED
	// shape — the members the validator actually sees. The id is what has to
	// hold, not the spelling.
	source := "import {createValidateFn, type DataOnly} from '@mionjs/run-types';\n" +
		"export const data = createValidateFn<DataOnly<{a: string; run: () => void}>>();\n"
	before := siteIDs(t, source)
	buildersForm := convertOneOK(t, source, convert.TargetBuilders)
	assertSameIDs(t, "DataOnly projection", before, siteIDs(t, buildersForm))
	if !strings.Contains(buildersForm, "createValidateFn(RT.object({a: TF.string()}))") {
		t.Errorf("expected the projected shape:\n%s", buildersForm)
	}
}

func TestCallSites_RefusalLeavesTheCallUntouched(t *testing.T) {
	// A call site has no name for a cycle to close on, so a recursive anonymous
	// type refuses — and refusing must leave the call byte-identical, exactly
	// like a refused declaration.
	source := "import {createValidateFn} from '@mionjs/run-types';\n" +
		"declare const tag: unique symbol;\n" +
		"export const tagged = createValidateFn<{[tag]: number}>();\n"
	output, diags := convertOne(t, source, convert.Options{Target: convert.TargetBuilders})
	if len(diags) == 0 {
		t.Fatalf("expected a refusal for the symbol-keyed member, got none:\n%s", output)
	}
	if !strings.Contains(output, "export const tagged = createValidateFn<{[tag]: number}>();") {
		t.Errorf("a refused call must be left untouched:\n%s", output)
	}
}

// convertOneOK converts and fails the test on any diagnostic.
func convertOneOK(t *testing.T, source string, target convert.Target) string {
	t.Helper()
	output, diags := convertOne(t, source, convert.Options{Target: target})
	if len(diags) > 0 {
		t.Fatalf("--to %s: unexpected diagnostics: %+v", target, diags)
	}
	return output
}
