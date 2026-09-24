package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// `{rejectCircularRefs: true}` forks the injected fnHash: the armed validator is a DISTINCT entry with the cycle guard baked in.
// It is orthogonal to the other ValidateOptions, so `numberMode` and `numberMode + rejectCircularRefs` fork too.
func TestRejectCircularRefsForksFnHash(t *testing.T) {
	const src = `import {createValidateFn} from '@mionjs/run-types';
interface Node {size: number; next?: Node}
createValidateFn<Node>();
createValidateFn<Node>(undefined, {rejectCircularRefs: true});
createValidateFn<Node>(undefined, {numberMode: 'typeof'});
createValidateFn<Node>(undefined, {numberMode: 'typeof', rejectCircularRefs: true});
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
	typeofMode := fnIDAt("createValidateFn<Node>(undefined, {numberMode: 'typeof'})")
	typeofCircular := fnIDAt("createValidateFn<Node>(undefined, {numberMode: 'typeof', rejectCircularRefs: true})")

	if plain == "" || circular == "" || typeofMode == "" || typeofCircular == "" {
		t.Fatalf("expected non-empty fnIds, got plain=%q circular=%q typeofMode=%q typeofCircular=%q", plain, circular, typeofMode, typeofCircular)
	}
	if plain == circular {
		t.Fatalf("rejectCircularRefs must fork the fnHash: plain=%q rejectCircularRefs=%q", plain, circular)
	}
	if typeofMode == typeofCircular {
		t.Fatalf("rejectCircularRefs must fork the numberMode typeof fnHash: %q vs %q", typeofMode, typeofCircular)
	}
	if plain == typeofMode {
		t.Fatalf("sanity: numberMode typeof should change the fnHash but matched plain (%q)", plain)
	}
	// All four are distinct — the two options are orthogonal.
	seen := map[string]bool{plain: true}
	for _, id := range []string{circular, typeofMode, typeofCircular} {
		if seen[id] {
			t.Fatalf("expected four distinct fnIds, got a collision at %q", id)
		}
		seen[id] = true
	}
}
