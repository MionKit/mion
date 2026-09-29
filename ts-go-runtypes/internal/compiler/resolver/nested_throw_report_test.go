package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// A site calling an always-throw entry throws too, so it reports that root code; paired shapes per the Marker test rule.
func TestNestedThrow_ReportsAtTheOuterSite(t *testing.T) {
	const shared = `export interface Inner { s: symbol[] }
export class Counter { #count = 0; label = ''; }
`
	cases := []struct {
		name, code, site string
	}{
		{"validate static", diagnostics.CodeVLSymbolRoot, `export const check = createValidateFn<{inner: Inner}>();`},
		{"validate value", diagnostics.CodeVLSymbolRoot, `declare const value: {inner: Inner};
export const check = createValidateFn(value);`},
		{"encoder static", diagnostics.CodePJSSymbolRoot, `export const encode = createJsonEncoderFn<{inner: Inner}>();`},
		{"encoder value", diagnostics.CodePJSSymbolRoot, `declare const value: {inner: Inner};
export const encode = createJsonEncoderFn(value);`},
		{"removeUnknownKeys static", diagnostics.CodeRUKPrivateFields, `export const strip = createRemoveUnknownKeysFn<{counter: Counter}>();`},
		{"removeUnknownKeys value", diagnostics.CodeRUKPrivateFields, `declare const value: {counter: Counter};
export const strip = createRemoveUnknownKeysFn(value);`},
		{"removeUnknownKeys two deep", diagnostics.CodeRUKPrivateFields, `export interface Holder { counter: Counter }
export const strip = createRemoveUnknownKeysFn<{holder: Holder}>();`},
	}
	for _, testCase := range cases {
		t.Run(testCase.name, func(t *testing.T) {
			response := wholeProgram(t, map[string]string{
				"shared.ts": shared,
				"site.ts": `import {createValidateFn, createJsonEncoderFn, createRemoveUnknownKeysFn} from '@mionjs/run-types';
import type {Inner} from './shared.ts';
import {Counter} from './shared.ts';
` + testCase.site + "\n",
			})
			sites := diagSitesFor(response, testCase.code)
			if len(sites) != 1 || sites[0] != "site.ts" {
				t.Errorf("%s must report once at the outer site, got %v; codes=%v", testCase.code, sites, codesOf(response))
			}
		})
	}
}

// A site that reaches the failing type through a family that does not call it stays quiet.
func TestNestedThrow_OtherFamilySiteStaysQuiet(t *testing.T) {
	response := wholeProgram(t, map[string]string{
		"shared.ts": `export class Counter { #count = 0; label = ''; }
`,
		"site.ts": `import {createValidateFn} from '@mionjs/run-types';
import {Counter} from './shared.ts';
export const check = createValidateFn<{counter: Counter}>();
`,
	})
	if sites := diagSitesFor(response, diagnostics.CodeRUKPrivateFields); len(sites) != 0 {
		t.Errorf("a validator must not report the copy's refusal, got %v", sites)
	}
}
