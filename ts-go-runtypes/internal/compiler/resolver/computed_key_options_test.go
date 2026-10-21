package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A computed key (`[tag]: 'x'`) in a marker's option object is skipped, never a panic. Both getRunTypeId shapes.
func TestScan_ComputedKeyInResolvedArgumentDoesNotPanic(t *testing.T) {
	const code = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Tagged {name: string; [tag]: string}
const sample: Tagged = {name: 'a', [tag]: 'x'};
export const reflectedId = getRunTypeId(sample);
export const staticId = getRunTypeId<Tagged>();
const options = {['noIsArrayCheck']: true} as const;
export const isTagged = createValidateFn<Tagged>(undefined, options);
`
	resolverSession := setupInline(t, map[string]string{"tagged.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"tagged.ts"}})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	assertOneReflectionID(t, response)
}

// The @nonEnumerable check names the member in its message; a computed key must not crash that either.
func TestScan_ComputedKeyNonEnumerableDoesNotPanic(t *testing.T) {
	const code = `import {createValidateFn, getRunTypeId} from '@mionjs/run-types';
const tag = Symbol('tag');
interface Tagged {
  name: string;
  /** @nonEnumerable */
  [tag]: string;
}
export const isTagged = createValidateFn<Tagged>();
export const staticId = getRunTypeId<Tagged>();
declare const sample: Tagged;
export const reflectedId = getRunTypeId(sample);
`
	resolverSession := setupInline(t, map[string]string{"tagged.ts": code})
	response := resolverSession.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"tagged.ts"}})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	for _, diagnostic := range response.Diagnostics {
		if diagnostic.Code == diagnostics.CodeNonEnumerableRequiresOptional {
			if len(diagnostic.Args) == 0 || diagnostic.Args[0] != "[tag]" {
				t.Errorf("data-non-enumerable-required must name the computed key as written, got %v", diagnostic.Args)
			}
			return
		}
	}
	t.Errorf("expected data-non-enumerable-required for a required @nonEnumerable member, got %+v", response.Diagnostics)
}
