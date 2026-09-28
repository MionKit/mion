package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// A site whose function calls an always-throw entry throws too, so it reports that entry's root code even though
// it never named the failing type. Paired call shapes per the Marker test coverage rule.
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
