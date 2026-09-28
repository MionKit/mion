package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// A marker argument that resolves to an object literal with a computed key (`[tag]: 'x'`) must not crash the
// scan: an option name is never computed, so the option reader skips such a key. Both getRunTypeId shapes.
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
	ids := map[string]bool{}
	for _, site := range response.Sites {
		if site.FnId == "" && site.ID != "" {
			ids[site.ID] = true
		}
	}
	if len(ids) != 1 {
		t.Errorf("both getRunTypeId shapes must resolve to one id, got %v", ids)
	}
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
				t.Errorf("NE001 must name the computed key as written, got %v", diagnostic.Args)
			}
			return
		}
	}
	t.Errorf("expected NE001 for a required @nonEnumerable member, got %+v", response.Diagnostics)
}
