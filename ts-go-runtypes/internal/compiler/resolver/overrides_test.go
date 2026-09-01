package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// overrideDTS declares the markers + a single overrideX twin (overrideValidate)
// plus getRunTypeId, enough to exercise the type-id fold end to end.
const overrideDTS = `declare module '@mionjs/run-types' {
  export type InjectRunTypeId<T> = string & {readonly __rtInjectRunTypeIdBrand?: T};
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type PureFunction<F> = F & {readonly __rtPureFunctionBrand?: never};
  export function getRunTypeId<T>(value?: T, id?: InjectRunTypeId<T>): InjectRunTypeId<T>;
  export function createValidateFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'val'>): (v: unknown) => boolean;
  export function createJsonEncoderFn<T>(val?: T, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): (v: unknown) => string | undefined;
  export function overrideValidate<T>(fn: PureFunction<(v: unknown) => boolean>, id?: InjectTypeFnArgs<T, 'val'>): void;
  export function overrideJsonEncoder<T>(fn: PureFunction<(v: unknown) => string>, id?: InjectTypeFnArgs<T, 'jsonEncoder'>): void;
}
`

// idByKind scans call.ts, dumps, and returns the wire id of the first node with
// the given kind (and that node, for further assertions).
func idByKind(t *testing.T, files map[string]string, kind reflection.ReflectionKind) (string, *reflection.RunType) {
	t.Helper()
	r := setupInline(t, files)
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}}); resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	for _, node := range r.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes {
		if node.Kind == kind {
			return node.ID, node
		}
	}
	t.Fatalf("no node of kind %d in dump", kind)
	return "", nil
}

// TestOverride_FoldsTypeIDAndPropagates is the core idempotency guarantee: an
// overrideValidate<string> shifts string's structural id (folds the cfn body
// hash) AND every containing type's id (propagation), so no cache key is ever
// reused with a different body across the override / no-override builds.
func TestOverride_FoldsTypeIDAndPropagates(t *testing.T) {
	without := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
getRunTypeId<{a: number; b: string}>();
`,
	}
	with := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {getRunTypeId, overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
getRunTypeId<string>();
getRunTypeId<{a: number; b: string}>();
`,
	}

	plainString, _ := idByKind(t, without, reflection.KindString)
	overriddenString, stringNode := idByKind(t, with, reflection.KindString)
	if plainString == overriddenString {
		t.Fatalf("override did not shift string's id: both %q", overriddenString)
	}
	if stringNode.Overrides["val"] == "" {
		t.Fatalf("overridden string node missing Overrides[val]: %+v", stringNode.Overrides)
	}

	plainStruct, _ := idByKind(t, without, reflection.KindObjectLiteral)
	overriddenStruct, _ := idByKind(t, with, reflection.KindObjectLiteral)
	if plainStruct == overriddenStruct {
		t.Fatalf("override did not propagate to the containing struct: both %q", overriddenStruct)
	}
}

// TestOverride_EmitsRedirectAndCfnModule proves the override is functional: a
// createValidateFn over a struct whose `string` field is overridden emits a
// validate redirect that calls the cfn (utl.usePureFn('cfn::…')) for that field,
// and the cfn module carries the user's body — propagation through the emitter.
func TestOverride_EmitsRedirectAndCfnModule(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createValidateFn, overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
export const isObj = createValidateFn<{a: number; b: string}>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	validateSources := familyEntrySources(resp, "validate")
	if !strings.Contains(validateSources, "usePureFn(") || !strings.Contains(validateSources, "cfn::") {
		t.Fatalf("validate family missing cfn redirect:\n%s", validateSources)
	}
	all := allEntrySources(resp)
	// The override body rides the cfn pure-fn module. In the default (code) emit
	// mode it ships as the pure-fn `code` STRING, whose single quotes are escaped
	// (`\'string\'`); match on the escaping-neutral prefix so this holds in every
	// emit mode (the same prefix appears in the functions-mode live literal too).
	if !strings.Contains(all, "return (v) => typeof v === ") {
		t.Fatalf("cfn module missing the override body:\n%s", all)
	}
}

// TestOverride_JsonEncoderComposite proves the headline use case: a hand-tuned
// JSON encoder replaces the composite entry with a cfn redirect.
func TestOverride_JsonEncoderComposite(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createJsonEncoderFn, overrideJsonEncoder} from '@mionjs/run-types';
overrideJsonEncoder<{id: number}>((v) => '{"id":' + (v as {id: number}).id + '}');
export const enc = createJsonEncoderFn<{id: number}>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	all := allEntrySources(resp)
	if !strings.Contains(all, "usePureFn(") || !strings.Contains(all, "cfn::") {
		t.Fatalf("json encoder composite missing cfn redirect:\n%s", all)
	}
	// Override body rides the cfn pure-fn module as the `code` string (default
	// emit mode); its surrounding single quotes are escaped in the code slot, so
	// match the JSON prefix itself — present in every emit mode.
	if !strings.Contains(all, `{"id":`) {
		t.Fatalf("cfn module missing the override body:\n%s", all)
	}
	// The composite redirect references no primitives, so the structural
	// prepareForJsonSafe (clone's primitive) is pruned for the overridden type.
	if hasFamilyEntry(resp, "prepareForJsonSafe") {
		t.Fatalf("overridden json encoder must prune its primitives, but pjs entries were emitted:\n%s", familyEntrySources(resp, "prepareForJsonSafe"))
	}
}

// TestOverride_DuplicateConflictEmitsOVR001 — there can be only one override per
// (type, function): a second one is a hard error, REGARDLESS of body (different
// OR identical). A single override does not trip it.
func TestOverride_DuplicateConflictEmitsOVR001(t *testing.T) {
	hasOVR001 := func(src string) bool {
		r := setupInline(t, map[string]string{"runtypes.d.ts": overrideDTS, "call.ts": src})
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		for _, d := range resp.Diagnostics {
			if d.Code == diagnostics.CodeDuplicateOverride {
				return true
			}
		}
		return false
	}

	// Different bodies → error.
	if !hasOVR001(`import {overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
overrideValidate<string>((v) => v !== null);
`) {
		t.Fatalf("expected OVR001 for two different-body overrides")
	}
	// Identical bodies → STILL an error (strict: one override per type+function).
	if !hasOVR001(`import {overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
overrideValidate<string>((v) => typeof v === 'string');
`) {
		t.Fatalf("expected OVR001 for two same-body overrides (strict one-per-type rule)")
	}
	// A single override → no error.
	if hasOVR001(`import {overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
`) {
		t.Fatalf("a single override must not emit OVR001")
	}
}

// TestOverride_NestedFixpoint — an override on a type that structurally CONTAINS
// another overridden type must still apply. `{x: string}` is validate-overridden
// while `string` is independently jsonEncoder-overridden; the struct's id folds
// string's override (global fold), so its validate-override base key only matches
// the main-pass folded key after the fixpoint. Single-pass base keys would miss it.
func TestOverride_NestedFixpoint(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createValidateFn, overrideValidate, overrideJsonEncoder} from '@mionjs/run-types';
overrideJsonEncoder<string>((v) => '"x"');
overrideValidate<{x: string}>((v) => true);
export const isObj = createValidateFn<{x: string}>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	// The struct's validate entry must be a cfn redirect (the override resolved
	// despite `string` being independently overridden inside it).
	if !strings.Contains(familyEntrySources(resp, "validate"), "usePureFn(") {
		t.Fatalf("nested override did not apply: struct validate is not a redirect:\n%s", familyEntrySources(resp, "validate"))
	}
}

// TestOverride_NullsArgOnTransform — OpTransform nulls the override's inline
// pure-fn arg (its body lives only in the cfn module) and injects the redirect
// tuple at the id slot. A `null` arg is then a quiet no-op on re-scan.
func TestOverride_NullsArgOnTransform(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createValidateFn, overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
export const isString = createValidateFn<string>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpTransform, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("transform: %s", resp.Error)
	}
	out := resp.Transformed["call.ts"].Code
	if strings.Contains(out, "typeof v === 'string'") {
		t.Fatalf("override arg not nulled, body still inline in rewritten source:\n%s", out)
	}
	if !strings.Contains(out, "overrideValidate") || !strings.Contains(out, "(null,") {
		t.Fatalf("expected overrideValidate(null, <tuple>):\n%s", out)
	}

	// A pre-nulled call (simulating a re-scan of rewritten source) registers no
	// override — CheckLiteralFunction returns Ok=false on a null arg.
	r2 := setupInline(t, map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {overrideValidate} from '@mionjs/run-types';
overrideValidate<string>(null);
`,
	})
	resp2 := r2.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	for _, d := range resp2.Diagnostics {
		if d.Code == diagnostics.CodeOverrideValidateCrossFamily {
			t.Fatalf("a null override arg must register no override (got OVR010)")
		}
	}
}

// TestOverride_ValidateEmitsOVR010 — overriding validate warns about its
// cross-family reach (decoders); overriding a non-shared family does not, and
// the happy path never trips the OVR002 missing-cfn assert.
func TestOverride_ValidateEmitsOVR010(t *testing.T) {
	codes := func(files map[string]string) map[string]int {
		r := setupInline(t, files)
		resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
		if resp.Error != "" {
			t.Fatalf("scanFiles: %s", resp.Error)
		}
		out := map[string]int{}
		for _, d := range resp.Diagnostics {
			out[d.Code]++
		}
		return out
	}

	valCodes := codes(map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createValidateFn, overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
export const isString = createValidateFn<string>();
`,
	})
	if valCodes[diagnostics.CodeOverrideValidateCrossFamily] == 0 {
		t.Fatalf("expected OVR010 for a validate override, got %+v", valCodes)
	}
	if valCodes[diagnostics.CodeOverrideMissingCfn] != 0 {
		t.Fatalf("happy path tripped OVR002: %+v", valCodes)
	}

	jsonCodes := codes(map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {createJsonEncoderFn, overrideJsonEncoder} from '@mionjs/run-types';
overrideJsonEncoder<{id: number}>((v) => '{"id":' + (v as {id: number}).id + '}');
export const enc = createJsonEncoderFn<{id: number}>();
`,
	})
	if jsonCodes[diagnostics.CodeOverrideValidateCrossFamily] != 0 {
		t.Fatalf("OVR010 should fire only for validate overrides, got %+v", jsonCodes)
	}
	if jsonCodes[diagnostics.CodeOverrideMissingCfn] != 0 {
		t.Fatalf("json happy path tripped OVR002: %+v", jsonCodes)
	}
}

// TestOverride_RecursiveFieldOverride — overriding a type used INSIDE a recursive
// type propagates through the cycle: `Node`'s id folds the `string` override (so
// it differs from the un-overridden Node and is stable across scans), the walk
// terminates, and the recursive validator references the `string` cfn redirect at
// the `tag` field while keeping normal cycle handling on `next: Node`.
func TestOverride_RecursiveFieldOverride(t *testing.T) {
	const recursiveSrc = `type Node = {tag: string; next: Node | null};
`
	without := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": recursiveSrc + `import {createValidateFn} from '@mionjs/run-types';
export const isNode = createValidateFn<Node>();
`,
	}
	with := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": recursiveSrc + `import {createValidateFn, overrideValidate} from '@mionjs/run-types';
overrideValidate<string>((v) => typeof v === 'string');
export const isNode = createValidateFn<Node>();
`,
	}

	plainNode, _ := idByKind(t, without, reflection.KindObjectLiteral)
	overriddenNode, _ := idByKind(t, with, reflection.KindObjectLiteral)
	if plainNode == overriddenNode {
		t.Fatalf("override did not propagate through the recursive Node: both ids %q", overriddenNode)
	}

	// Idempotency: a second scan of the same source yields the same Node id.
	again, _ := idByKind(t, with, reflection.KindObjectLiteral)
	if again != overriddenNode {
		t.Fatalf("recursive override id not stable across scans: %q vs %q", overriddenNode, again)
	}

	// The recursive validator references the string cfn redirect at `tag`.
	r := setupInline(t, with)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if !strings.Contains(familyEntrySources(resp, "validate"), "usePureFn(") {
		t.Fatalf("recursive Node validator missing the string cfn redirect:\n%s", familyEntrySources(resp, "validate"))
	}
}

// TestOverride_RecursiveTypeItselfOverride — overriding the recursive type itself
// makes its whole entry a cfn redirect; BaseStructuralKey must resolve through the
// cycle without looping and fold a deterministic id, with no spurious OVR002.
func TestOverride_RecursiveTypeItselfOverride(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `type Node = {tag: string; next: Node | null};
import {createValidateFn, overrideValidate} from '@mionjs/run-types';
overrideValidate<Node>((v) => typeof v === 'object' && v !== null);
export const isNode = createValidateFn<Node>();
`,
	}
	r := setupInline(t, files)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	validateSources := familyEntrySources(resp, "validate")
	if !strings.Contains(validateSources, "usePureFn(") || !strings.Contains(validateSources, "cfn::") {
		t.Fatalf("recursive-type override is not a redirect:\n%s", validateSources)
	}
	for _, d := range resp.Diagnostics {
		if d.Code == diagnostics.CodeOverrideMissingCfn {
			t.Fatalf("recursive override tripped OVR002 (missing cfn): %+v", resp.Diagnostics)
		}
	}
}

// TestOverride_AbsentLeavesIDsUnchanged guards the no-override path: a file with
// no overrideX call produces exactly the same ids it did before the feature
// (the fold is inert when the override map is empty).
func TestOverride_AbsentLeavesIDsUnchanged(t *testing.T) {
	files := map[string]string{
		"runtypes.d.ts": overrideDTS,
		"call.ts": `import {getRunTypeId} from '@mionjs/run-types';
getRunTypeId<string>();
`,
	}
	id, node := idByKind(t, files, reflection.KindString)
	if id == "" {
		t.Fatalf("string id empty")
	}
	if len(node.Overrides) != 0 {
		t.Fatalf("un-overridden string carries Overrides: %+v", node.Overrides)
	}
}
