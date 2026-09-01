package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Cross-site mockSamples conflicts (FMT006).
//
// mockSamples are NOT id-relevant — they describe how to generate a sample, not
// what the format validates — so two formats identical apart from their pools
// intern as ONE cache entry. That dedup is the point. The residue: one entry can
// only carry one pool, so when both sites DECLARE one and they differ, the entry
// keeps whichever it saw first and scan order silently decides. These tests pin
// the three outcomes:
//
//	both declare, pools differ  → FMT006, naming both pools and the first site
//	one declares, other absent  → no error, and the declared pool is ADOPTED
//	both declare the same pool  → no error, still one entry

// sampleConflictDiags returns the FMT006 diagnostics from a scan of `files`.
func sampleConflictDiags(t *testing.T, files map[string]string) []diagnostics.Diagnostic {
	t.Helper()
	session := setupInline(t, files)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	// Deterministic scan order: the diagnostic names the site that interned
	// first, so the order files are handed over decides which that is.
	sortStrings(names)
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: names})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	var out []diagnostics.Diagnostic
	for _, diag := range resp.Diagnostics {
		if diag.Code == diagnostics.CodeFMTSampleConflict {
			out = append(out, diag)
		}
	}
	return out
}

func sortStrings(values []string) {
	for i := 1; i < len(values); i++ {
		for j := i; j > 0 && values[j] < values[j-1]; j-- {
			values[j], values[j-1] = values[j-1], values[j]
		}
	}
}

func TestSampleConflict_DifferentDeclaredPools_Errors(t *testing.T) {
	diags := sampleConflictDiags(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
type A = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['aaa']}};
export const _a = getRunTypeId<A>();
`,
		"b.ts": `import {getRunTypeId} from '@mionjs/run-types';
type B = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['bbb']}};
export const _b = getRunTypeId<B>();
`,
	})
	if len(diags) != 1 {
		t.Fatalf("expected exactly one FMT006, got %d: %+v", len(diags), diags)
	}
	// Both pools must appear, so the message alone says what disagrees.
	joined := strings.Join(diags[0].Args, " | ")
	if !strings.Contains(joined, "aaa") || !strings.Contains(joined, "bbb") {
		t.Fatalf("expected both pools in the args, got %q", joined)
	}
	// …and the site that interned first, so both ends are reachable.
	if !strings.Contains(joined, "a.ts") {
		t.Fatalf("expected the first-interning site in the args, got %q", joined)
	}
	if diags[0].Severity != diagnostics.SeverityError {
		t.Fatalf("FMT006 must be an error, got severity %v", diags[0].Severity)
	}
}

// adoptedSamples scans `files` and returns the shared entry's mockSamples, so a
// test can assert WHICH pool the entry ended up carrying — not merely that no
// diagnostic fired.
func adoptedSamples(t *testing.T, files map[string]string) []any {
	t.Helper()
	session := setupInline(t, files)
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sortStrings(names)
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: names})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) < 2 {
		t.Fatalf("expected both sites to resolve, got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("the two sites must dedup onto ONE entry (samples are not id-relevant), got %q and %q",
			resp.Sites[0].ID, resp.Sites[1].ID)
	}
	for _, node := range session.Dispatch(protocol.Request{Op: protocol.OpDump}).RunTypes {
		if node.ID != resp.Sites[0].ID || node.FormatAnnotation == nil {
			continue
		}
		samples, _ := node.FormatAnnotation.Params["mockSamples"].([]any)
		return samples
	}
	t.Fatalf("shared entry %q not found in the dump", resp.Sites[0].ID)
	return nil
}

// The declared pool is ADOPTED, not merely tolerated: a pool-less site seen
// first must not cost the other site its samples, or the "no conflict" verdict
// would be hiding a silently dropped declaration.
func TestSampleConflict_DeclaredPoolIsAdoptedWhenSeenSecond(t *testing.T) {
	samples := adoptedSamples(t, map[string]string{
		// a.ts declares nothing and is scanned first, so it interns the entry.
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
type W = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5}};
export const _w = getRunTypeId<W>();
`,
		"b.ts": `import {getRunTypeId} from '@mionjs/run-types';
type D = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['aaa']}};
export const _d = getRunTypeId<D>();
`,
	})
	if len(samples) != 1 || samples[0] != "aaa" {
		t.Fatalf("expected the shared entry to adopt the declared pool [aaa], got %+v", samples)
	}
}

func TestSampleConflict_DeclaredVersusAbsent_NoError(t *testing.T) {
	// Absence is not an opinion: a site that declares nothing must not conflict
	// with one that does, whichever is seen first.
	for _, order := range []struct {
		name              string
		declared, without string
	}{
		{"declared first", "a.ts", "b.ts"},
		{"absent first", "b.ts", "a.ts"},
	} {
		t.Run(order.name, func(t *testing.T) {
			diags := sampleConflictDiags(t, map[string]string{
				order.declared: `import {getRunTypeId} from '@mionjs/run-types';
type D = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['aaa']}};
export const _d = getRunTypeId<D>();
`,
				order.without: `import {getRunTypeId} from '@mionjs/run-types';
type W = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5}};
export const _w = getRunTypeId<W>();
`,
			})
			if len(diags) != 0 {
				t.Fatalf("declared-vs-absent must not conflict, got %+v", diags)
			}
		})
	}
}

func TestSampleConflict_SameDeclaredPool_NoError(t *testing.T) {
	diags := sampleConflictDiags(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
type A = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['aaa']}};
export const _a = getRunTypeId<A>();
`,
		"b.ts": `import {getRunTypeId} from '@mionjs/run-types';
type B = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['aaa']}};
export const _b = getRunTypeId<B>();
`,
	})
	if len(diags) != 0 {
		t.Fatalf("identical declared pools must not conflict, got %+v", diags)
	}
}

// The pool ORDER is what the generator indexes into, so two pools with the same
// members in a different order really do produce different values for one seed.
func TestSampleConflict_ReorderedPool_Errors(t *testing.T) {
	diags := sampleConflictDiags(t, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
type A = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['aaa', 'bbb']}};
export const _a = getRunTypeId<A>();
`,
		"b.ts": `import {getRunTypeId} from '@mionjs/run-types';
type B = string & {readonly __rtFormatName?: 'stringFormat'; readonly __rtFormatParams?: {maxLength: 5; mockSamples: ['bbb', 'aaa']}};
export const _b = getRunTypeId<B>();
`,
	})
	if len(diags) != 1 {
		t.Fatalf("a reordered pool is a different pool; expected one FMT006, got %d: %+v", len(diags), diags)
	}
}
