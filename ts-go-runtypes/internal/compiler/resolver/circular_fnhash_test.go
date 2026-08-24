package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// The per-call `{rejectCircularRefs: true}` option is now a COMPILE-TIME option:
// it forks the injected fnHash (like `noLiterals`), so an armed validator and a
// plain one for the same type resolve to DISTINCT compiled entries — the armed
// one bakes the inline cycle guard into its body. It is orthogonal to the other
// ValidateOptions, so `noLiterals` and `noLiterals + rejectCircularRefs` also
// fork.
func TestRejectCircularRefsForksFnHash(t *testing.T) {
	const src = `import {createValidateFn} from '@ts-runtypes/core';
interface Node {name: string; next?: Node}
createValidateFn<Node>();
createValidateFn<Node>(undefined, {rejectCircularRefs: true});
createValidateFn<Node>(undefined, {noLiterals: true});
createValidateFn<Node>(undefined, {noLiterals: true, rejectCircularRefs: true});
`
	r := setupInline(t, map[string]string{"a.ts": src})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}

	fnIDAt := func(needle string) string {
		idx := strings.Index(src, needle)
		if idx < 0 {
			t.Fatalf("needle %q not found", needle)
		}
		closeParen := idx + len(needle) - 1
		for _, site := range resp.Sites {
			if site.Pos == closeParen {
				return site.FnId
			}
		}
		t.Fatalf("no site at close-paren %d for %q; sites=%+v", closeParen, needle, resp.Sites)
		return ""
	}

	plain := fnIDAt("createValidateFn<Node>()")
	circular := fnIDAt("createValidateFn<Node>(undefined, {rejectCircularRefs: true})")
	noLiterals := fnIDAt("createValidateFn<Node>(undefined, {noLiterals: true})")
	noLiteralsCircular := fnIDAt("createValidateFn<Node>(undefined, {noLiterals: true, rejectCircularRefs: true})")

	if plain == "" || circular == "" || noLiterals == "" || noLiteralsCircular == "" {
		t.Fatalf("expected non-empty fnIds, got plain=%q circular=%q noLiterals=%q noLiteralsCircular=%q", plain, circular, noLiterals, noLiteralsCircular)
	}
	if plain == circular {
		t.Fatalf("rejectCircularRefs must fork the fnHash: plain=%q rejectCircularRefs=%q", plain, circular)
	}
	if noLiterals == noLiteralsCircular {
		t.Fatalf("rejectCircularRefs must fork the noLiterals fnHash: %q vs %q", noLiterals, noLiteralsCircular)
	}
	if plain == noLiterals {
		t.Fatalf("sanity: noLiterals should change the fnHash but matched plain (%q)", plain)
	}
	// All four are distinct — the two options are orthogonal.
	seen := map[string]bool{plain: true}
	for _, id := range []string{circular, noLiterals, noLiteralsCircular} {
		if seen[id] {
			t.Fatalf("expected four distinct fnIds, got a collision at %q", id)
		}
		seen[id] = true
	}
}
