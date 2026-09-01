package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// External-module marker matrix. Each row defines a type / schema / preset /
// pure-fn in one module and uses the marker
// in another, asserting the cross-module result converges with the inline twin —
// and that the new hardening diagnostics (CTA004 widened const, PFN002 external
// pure-fn handle) fire where intended.

// scanExternal scans `call.ts` (the consumer) against the real marker package
// (injected by setupInline), following its imports into the other source
// files in the overlay.
func scanExternal(t *testing.T, files map[string]string) protocol.Response {
	t.Helper()
	overlay := map[string]string{}
	for name, source := range files {
		overlay[name] = source
	}
	r := setupInline(t, overlay)
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// gateCodes returns the hard marker GATES (CTA0xx / PFNxxx) raised, ignoring the
// advisory MKR no-op warnings (`noLiterals`/`noIsArrayCheck` are no-ops on some
// types and fire MKR004/MKR005 independently of what these tests assert).
func gateCodes(resp protocol.Response) []string {
	var codes []string
	for _, d := range resp.Diagnostics {
		if d.Family == diagnostics.FamilyMarker && (strings.HasPrefix(d.Code, "CTA") || strings.HasPrefix(d.Code, "PFN")) {
			codes = append(codes, d.Code)
		}
	}
	return codes
}

// TestExternalModule_GetRunTypeIdConverges — the InjectRunTypeId reflection
// marker over an IMPORTED type. Per the marker-coverage rule it pairs BOTH
// getRunTypeId shapes (reflection `getRunTypeId(value)` first to dodge the
// known static-then-reflect ordering quirk, then static `getRunTypeId<T>()`)
// and asserts they converge with each other AND with an inline structural twin.
func TestExternalModule_GetRunTypeIdConverges(t *testing.T) {
	const types = `export interface User { name: string; age: number; }`
	const code = `import {getRunTypeId} from '@mionjs/run-types';
import type {User} from './types';
declare const u: User;
export const reflectId = getRunTypeId(u);
export const staticId = getRunTypeId<User>();
export const inlineId = getRunTypeId<{name: string; age: number}>();
`
	resp := scanExternal(t, map[string]string{"types.ts": types, "call.ts": code})
	if len(resp.Sites) != 3 {
		t.Fatalf("expected 3 getRunTypeId sites, got %d", len(resp.Sites))
	}
	reflectID, staticID, inlineID := resp.Sites[0].ID, resp.Sites[1].ID, resp.Sites[2].ID
	if reflectID != staticID {
		t.Errorf("getRunTypeId shapes must converge for an imported type: reflect ID=%q, static ID=%q", reflectID, staticID)
	}
	if staticID != inlineID {
		t.Errorf("imported type must converge with its inline structural twin: imported ID=%q, inline ID=%q", staticID, inlineID)
	}
}

// TestExternalModule_CreateXConverges — InjectTypeFnArgs over an IMPORTED type,
// across the static form (`createValidateFn<User>()`) and the value-first schema
// form is exercised in the JS suite; here we pin fnId convergence with the
// inline twin for both validate and the JSON encoder family.
func TestExternalModule_CreateXConverges(t *testing.T) {
	const types = `export interface User { name: string; age: number; }`
	const code = `import {createValidateFn, createJsonEncoderFn} from '@mionjs/run-types';
import type {User} from './types';
export const importedVal = createValidateFn<User>();
export const inlineVal = createValidateFn<{name: string; age: number}>();
export const importedJson = createJsonEncoderFn<User>();
export const inlineJson = createJsonEncoderFn<{name: string; age: number}>();
`
	resp := scanExternal(t, map[string]string{"types.ts": types, "call.ts": code})
	if codes := gateCodes(resp); len(codes) != 0 {
		t.Fatalf("expected no CTA/PFN gate diagnostics, got %v", codes)
	}
	if len(resp.Sites) != 4 {
		t.Fatalf("expected 4 createX sites, got %d", len(resp.Sites))
	}
	if resp.Sites[0].FnId != resp.Sites[1].FnId {
		t.Errorf("createValidateFn<User> must converge with the inline twin: imported FnId=%q, inline FnId=%q", resp.Sites[0].FnId, resp.Sites[1].FnId)
	}
	if resp.Sites[2].FnId != resp.Sites[3].FnId {
		t.Errorf("createJsonEncoderFn<User> must converge with the inline twin: imported FnId=%q, inline FnId=%q", resp.Sites[2].FnId, resp.Sites[3].FnId)
	}
}

// TestExternalModule_WholeConstOptionBag — Decision 1 for option bags: a WHOLE
// imported `const` preset (declared `as const`) selects the same fn variant as
// the inlined and the spread-merged equivalents.
func TestExternalModule_WholeConstOptionBag(t *testing.T) {
	const opts = `export const strict = {noLiterals: true, noIsArrayCheck: true} as const;`
	const code = `import {createValidateFn} from '@mionjs/run-types';
import {strict} from './opts';
export const whole = createValidateFn<string>(undefined, strict);
export const spread = createValidateFn<string>(undefined, {...strict});
export const inline = createValidateFn<string>(undefined, {noLiterals: true, noIsArrayCheck: true});
export const none = createValidateFn<string>();
`
	resp := scanExternal(t, map[string]string{"opts.ts": opts, "call.ts": code})
	if codes := gateCodes(resp); len(codes) != 0 {
		t.Fatalf("expected no CTA/PFN gate diagnostics for an `as const` whole-const preset, got %v", codes)
	}
	if len(resp.Sites) != 4 {
		t.Fatalf("expected 4 sites, got %d", len(resp.Sites))
	}
	whole, spread, inline, none := resp.Sites[0].FnId, resp.Sites[1].FnId, resp.Sites[2].FnId, resp.Sites[3].FnId
	if whole != inline {
		t.Errorf("whole imported const must match the inlined variant: whole FnId=%q, inline FnId=%q", whole, inline)
	}
	if whole != spread {
		t.Errorf("whole imported const must match the spread-merged variant: whole FnId=%q, spread FnId=%q", whole, spread)
	}
	if whole == none {
		t.Errorf("whole imported const options were silently dropped: equals the no-options variant %q", none)
	}
}

// TestExternalModule_WidenedConstRejected — the `as const` hardening at the call
// site: a non-`as const` preset (same-module or imported) is widened, so it is
// rejected with CTA004 instead of silently selecting a possibly-wrong variant.
func TestExternalModule_WidenedConstRejected(t *testing.T) {
	cases := map[string]map[string]string{
		"same-module": {"call.ts": `import {createValidateFn} from '@mionjs/run-types';
const loose = {noLiterals: true};
export const bad = createValidateFn<string>(undefined, loose);
`},
		"cross-module": {
			"opts.ts": `export const loose = {noLiterals: true};`,
			"call.ts": `import {createValidateFn} from '@mionjs/run-types';
import {loose} from './opts';
export const bad = createValidateFn<string>(undefined, loose);
`},
	}
	for name, files := range cases {
		t.Run(name, func(t *testing.T) {
			resp := scanExternal(t, files)
			codes := gateCodes(resp)
			if len(codes) != 1 || codes[0] != diagnostics.CodeCompTimeArgsWidenedConst {
				t.Fatalf("expected exactly one CTA004 gate, got %v", codes)
			}
		})
	}
}

// TestExternalModule_PureFnExternalHandleRejected — Part 2: a PureFunction literal
// reachable as a value (imported OR exported) is rejected with PFN002, so the
// AOT-compiled copy is the only thing that can run.
func TestExternalModule_PureFnExternalHandleRejected(t *testing.T) {
	cases := map[string]map[string]string{
		"imported": {
			"lib.ts": `export const isString = (v: unknown) => typeof v === 'string';`,
			"call.ts": `import {withValidator} from '@mionjs/run-types';
import {isString} from './lib';
withValidator<string>(isString);
`},
		"exported-const": {"call.ts": `import {withValidator} from '@mionjs/run-types';
export const isString = (v: unknown) => typeof v === 'string';
withValidator<string>(isString);
`},
		"exported-function": {"call.ts": `import {withValidator} from '@mionjs/run-types';
export function isString(v: unknown) { return typeof v === 'string'; }
withValidator<string>(isString);
`},
		"export-statement": {"call.ts": `import {withValidator} from '@mionjs/run-types';
const isString = (v: unknown) => typeof v === 'string';
export {isString};
withValidator<string>(isString);
`},
	}
	for name, files := range cases {
		t.Run(name, func(t *testing.T) {
			// This matrix keeps the pureFunctionDts shape-probe ambient (a
			// wrapper declaring its own PureFunction param) instead of the
			// real package — the probe IS the subject.
			files["runtypes.d.ts"] = pureFunctionDts
			resp := scanExternal(t, files)
			codes := gateCodes(resp)
			if len(codes) != 1 || codes[0] != diagnostics.CodePureFunctionExternalHandle {
				t.Fatalf("expected exactly one PFN002, got %v", codes)
			}
		})
	}
}

// TestExternalModule_PureFnInlineAccepted is the negative control: an inline
// pure-fn literal still passes (no PFN gate).
func TestExternalModule_PureFnInlineAccepted(t *testing.T) {
	cases := map[string]string{
		"inline-arrow":    `withValidator<string>((v) => typeof v === 'string');`,
		"inline-function": `withValidator<string>(function (v) { return typeof v === 'string'; });`,
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			code := "import {withValidator} from '@mionjs/run-types';\n" + body + "\n"
			resp := scanExternal(t, map[string]string{"runtypes.d.ts": pureFunctionDts, "call.ts": code})
			if codes := gateCodes(resp); len(codes) != 0 {
				t.Fatalf("expected no PFN/CTA gate for an inline pure-fn, got %v", codes)
			}
		})
	}
}

// TestExternalModule_PureFnNamedLocalRejected: under literal-only even a
// module-private named const / function reference is rejected (PFN001) — the
// function must be inlined so it has no handle anything else could reach.
func TestExternalModule_PureFnNamedLocalRejected(t *testing.T) {
	cases := map[string]string{
		"local-const":    "const isString = (v: unknown) => typeof v === 'string';\nwithValidator<string>(isString);",
		"local-function": "function isString(v: unknown) { return typeof v === 'string'; }\nwithValidator<string>(isString);",
	}
	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			code := "import {withValidator} from '@mionjs/run-types';\n" + body + "\n"
			resp := scanExternal(t, map[string]string{"runtypes.d.ts": pureFunctionDts, "call.ts": code})
			codes := gateCodes(resp)
			if len(codes) != 1 || codes[0] != diagnostics.CodePureFunctionNotLiteral {
				t.Fatalf("expected exactly one PFN001, got %v", codes)
			}
		})
	}
}
