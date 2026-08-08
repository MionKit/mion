package resolver_test

import (
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// TestPerRequestScope_FilesOnly verifies that scanFiles responses are
// scoped to the request's Files slice, NOT to every file scanned in the
// session. scanFiles([a]) → only a's ids; scanFiles([b]) → only b's ids;
// scanFiles([a, b]) → union of both. The cache holds entries for every
// scanned file (dump exposes the whole thing), but the request's
// runTypes/runTypeCacheSource projection only sees the listed files.
func TestPerRequestScope_FilesOnly(t *testing.T) {
	const aSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	const bSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})

	respA := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	idA := respA.Sites[0].ID

	// scanFiles([b]) — the projection should NOT include a's ids, even though
	// a was scanned just above and the cache still holds those entries.
	respB := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"b.ts"},
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idB := respB.Sites[0].ID
	if containsID(respB.RunTypes, idA) {
		t.Fatalf("scanFiles([b.ts]) leaked a.ts's id %q into the response — projection must be request-scoped", idA)
	}
	if !containsID(respB.RunTypes, idB) {
		t.Fatalf("scanFiles([b.ts]) missing its own id %q", idB)
	}
	// EntryModules scoping mirrors runTypes scoping — no module keyed by (or
	// importing) a.ts's id may appear in b.ts's projection.
	if _, leaked := respB.EntryModules[idA]; leaked {
		t.Fatalf("scanFiles([b.ts]) EntryModules contains a.ts's runtype module %q; projection must be request-scoped", idA)
	}
	if strings.Contains(allEntrySources(respB), idA) {
		t.Fatalf("scanFiles([b.ts]) entry modules mention a.ts's id %q; projection must be request-scoped", idA)
	}

	// scanFiles([a, b]) — single request, both files, both ids present.
	respAB := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts", "b.ts"},
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	})
	if respAB.Error != "" {
		t.Fatalf("scanFiles [a, b]: %s", respAB.Error)
	}
	if !containsID(respAB.RunTypes, idA) {
		t.Fatalf("scanFiles([a, b]) missing a.ts's id %q", idA)
	}
	if !containsID(respAB.RunTypes, idB) {
		t.Fatalf("scanFiles([a, b]) missing b.ts's id %q", idB)
	}
	// Sites in the response cover BOTH files (flat, each tagged with .File).
	gotA, gotB := false, false
	for _, site := range respAB.Sites {
		switch site.File {
		case "a.ts":
			gotA = true
		case "b.ts":
			gotB = true
		}
	}
	if !gotA || !gotB {
		t.Fatalf("scanFiles([a, b]) sites must cover both files, got gotA=%v gotB=%v sites=%+v", gotA, gotB, respAB.Sites)
	}
}

// TestPerRequestScope_DedupAcrossRequestedFiles: two files in one request
// referencing the same shape produce a single wire id and the union slice
// contains it exactly once.
func TestPerRequestScope_DedupAcrossRequestedFiles(t *testing.T) {
	const src = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	r := setupInline(t, map[string]string{"a.ts": src, "b.ts": src})

	resp := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts", "b.ts"},
		IncludeRunTypes: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 sites (one per file), got %d", len(resp.Sites))
	}
	if resp.Sites[0].ID != resp.Sites[1].ID {
		t.Fatalf("expected identical id across files, got %q vs %q", resp.Sites[0].ID, resp.Sites[1].ID)
	}
	stringCount := 0
	for _, runType := range resp.RunTypes {
		if runType != nil && runType.Kind == protocol.KindString {
			stringCount++
		}
	}
	if stringCount != 1 {
		t.Fatalf("expected exactly one KindString entry across union, got %d", stringCount)
	}
}

// TestPerRequestScope_ResetWipesFileRecords: after reset + setSources, a
// scanFiles([a]) projection contains only a's ids — no leak from the
// pre-reset session.
func TestPerRequestScope_ResetWipesFileRecords(t *testing.T) {
	const aSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	const bSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idA := respA.Sites[0].ID
	idB := respB.Sites[0].ID

	r.Reset()
	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: withRealMarker(t, map[string]string{"a.ts": aSrc}),
	}); resp.Error != "" {
		t.Fatalf("setSources after reset: %s", resp.Error)
	}

	respAfter := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts"},
		IncludeRunTypes: true,
	})
	if respAfter.Error != "" {
		t.Fatalf("scanFiles a.ts after reset: %s", respAfter.Error)
	}
	if containsID(respAfter.RunTypes, idB) {
		t.Fatalf("scanFiles after reset leaked b.ts's id %q from prior session", idB)
	}
	if !containsID(respAfter.RunTypes, idA) {
		t.Fatalf("scanFiles after reset missing the just-scanned a.ts id %q", idA)
	}
}

// TestPerRequestScope_SetSourcesWipesFileRecords: same boundary, via
// setSources rather than reset. setSources rebuilds the Program and so
// must drop the per-file record map.
func TestPerRequestScope_SetSourcesWipesFileRecords(t *testing.T) {
	const aSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	const bSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	if resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}}); resp.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", resp.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idB := respB.Sites[0].ID

	if resp := r.Dispatch(protocol.Request{
		Op:      protocol.OpSetSources,
		Sources: withRealMarker(t, map[string]string{"a.ts": aSrc}),
	}); resp.Error != "" {
		t.Fatalf("setSources: %s", resp.Error)
	}

	respAfter := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"a.ts"},
		IncludeRunTypes: true,
	})
	if respAfter.Error != "" {
		t.Fatalf("scanFiles a.ts after setSources: %s", respAfter.Error)
	}
	if containsID(respAfter.RunTypes, idB) {
		t.Fatalf("scanFiles after setSources leaked b.ts's id %q from prior session", idB)
	}
}

// TestDump_FullCacheRegardlessOfPriorScans guards against the per-request
// scoping change accidentally narrowing dump's payload. dump must return
// the full in-memory cache (every type that's been projected, every site
// that's been recorded), regardless of which subset of files the latest
// scanFiles call asked about.
func TestDump_FullCacheRegardlessOfPriorScans(t *testing.T) {
	const aSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<string>();
`
	const bSrc = `import {getRunTypeId} from '@ts-runtypes/core';
getRunTypeId<{a: number}>();
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc})
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}
	idA := respA.Sites[0].ID
	idB := respB.Sites[0].ID

	dumpResp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dumpResp.Error != "" {
		t.Fatalf("dump: %s", dumpResp.Error)
	}
	if !containsID(dumpResp.RunTypes, idA) {
		t.Fatalf("dump missing a.ts's id %q (expected full in-memory cache)", idA)
	}
	if !containsID(dumpResp.RunTypes, idB) {
		t.Fatalf("dump missing b.ts's id %q (expected full in-memory cache)", idB)
	}
	if len(dumpResp.EntryModules) == 0 {
		t.Fatalf("dump: expected populated entryModules")
	}
	// The dump must contain one runtype entry module per interned id so
	// consumers can resolve any virtual specifier against the full cache.
	if _, ok := dumpResp.EntryModules[idA]; !ok {
		t.Fatalf("dump entryModules missing runtype module for id %q", idA)
	}
	if _, ok := dumpResp.EntryModules[idB]; !ok {
		t.Fatalf("dump entryModules missing runtype module for id %q", idB)
	}
}

func containsID(runTypes []*protocol.RunType, id string) bool {
	for _, runType := range runTypes {
		if runType != nil && runType.ID == id {
			return true
		}
	}
	return false
}

// TestScope_UnreferencedTypesAreNotProjected pins the bounded-scope
// invariant at the FILE level: a file containing both marker call sites
// AND unreferenced type aliases must produce a cache containing ONLY
// the marker-referenced type's projection. Aliases that no marker call
// touches must never end up in the cache.
//
// The invariant is enforced by scanFiles walking CallExpression nodes
// only (via forEachCallExpression) and triggering type
// projection (cache.AssignID) only for marker call arguments. This
// test makes the contract observable so a future refactor that
// accidentally extended the scan to "every type the file declares"
// breaks loudly.
func TestScope_UnreferencedTypesAreNotProjected(t *testing.T) {
	const src = `import {getRunTypeId} from '@ts-runtypes/core';

// Referenced — has a marker call; should be projected.
type Referenced = {a: string; b: number};

// Unreferenced — each declares a UNIQUE kind that Referenced doesn't
// touch, so if any of these leaked into the cache the assertions below
// catch it loudly.
type UnusedA = {x: bigint};                  // KindBigInt
type UnusedB = {y: Date};                    // KindClass with SubKindDate
export type UnusedC = string[];              // KindArray

getRunTypeId<Referenced>();
`
	r := setupInline(t, map[string]string{"call.ts": src})
	resp := r.Dispatch(protocol.Request{
		Op:              protocol.OpScanFiles,
		Files:           []string{"call.ts"},
		IncludeRunTypes: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 1 {
		t.Fatalf("expected 1 site (the getRunTypeId<Referenced> call), got %d", len(resp.Sites))
	}
	// The Referenced type must appear in the projection.
	if !containsID(resp.RunTypes, resp.Sites[0].ID) {
		t.Fatalf("expected Referenced's id %q in projection", resp.Sites[0].ID)
	}
	// Tell-tale kinds — none of these appear in Referenced's structure
	// ({a: string; b: number}), so finding any of them means an
	// unreferenced alias leaked into the cache.
	for _, runType := range resp.RunTypes {
		if runType == nil {
			continue
		}
		switch runType.Kind {
		case protocol.KindBigInt:
			t.Errorf("UnusedA leaked: found KindBigInt node id=%q", runType.ID)
		case protocol.KindArray:
			t.Errorf("UnusedC leaked: found KindArray node id=%q", runType.ID)
		case protocol.KindClass:
			if runType.SubKind == protocol.SubKindDate {
				t.Errorf("UnusedB leaked: found KindClass+SubKindDate node id=%q", runType.ID)
			}
		}
	}
}

// TestDump_OnlyMarkerReachableTypes pins the bounded-scope invariant
// at the DUMP level: across multiple files, including one with NO
// marker calls, OpDump returns only types reachable from accumulated
// marker sites. scanAllProgramFiles will eagerly scan every Program
// file before the dump — this test confirms the eager scan finds no
// markers in unrelated files and therefore projects nothing from them.
func TestDump_OnlyMarkerReachableTypes(t *testing.T) {
	const aSrc = `import {getRunTypeId} from '@ts-runtypes/core';
type Junk = {trash: bigint};
getRunTypeId<{a: string}>();
`
	const bSrc = `import {getRunTypeId} from '@ts-runtypes/core';
interface Garbage { rubbish: Date }
getRunTypeId<{b: number}>();
`
	// c.ts has NO marker imports and NO marker calls — scanAllProgramFiles
	// will reach it but find nothing to project.
	const cSrc = `export type OnlyAlias = boolean[];
`
	r := setupInline(t, map[string]string{"a.ts": aSrc, "b.ts": bSrc, "c.ts": cSrc})

	// Scan a + b explicitly. c.ts is NOT scanned here.
	respA := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}})
	if respA.Error != "" {
		t.Fatalf("scanFiles a.ts: %s", respA.Error)
	}
	respB := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"b.ts"}})
	if respB.Error != "" {
		t.Fatalf("scanFiles b.ts: %s", respB.Error)
	}

	// Dump triggers scanAllProgramFiles which will visit c.ts.
	dumpResp := r.Dispatch(protocol.Request{Op: protocol.OpDump})
	if dumpResp.Error != "" {
		t.Fatalf("dump: %s", dumpResp.Error)
	}

	// The two marker-referenced object types must appear.
	if !containsID(dumpResp.RunTypes, respA.Sites[0].ID) {
		t.Fatalf("dump missing a.ts's marker-referenced id %q", respA.Sites[0].ID)
	}
	if !containsID(dumpResp.RunTypes, respB.Sites[0].ID) {
		t.Fatalf("dump missing b.ts's marker-referenced id %q", respB.Sites[0].ID)
	}

	// Unreferenced aliases — each carries a unique kind not used by any
	// marker-referenced type. Finding any of them in the dump means a
	// non-marker-driven projection leaked.
	for _, runType := range dumpResp.RunTypes {
		if runType == nil {
			continue
		}
		switch runType.Kind {
		case protocol.KindBigInt:
			t.Errorf("Junk leaked from a.ts: found KindBigInt node id=%q", runType.ID)
		case protocol.KindClass:
			if runType.SubKind == protocol.SubKindDate {
				t.Errorf("Garbage leaked from b.ts: found KindClass+SubKindDate node id=%q", runType.ID)
			}
		case protocol.KindBoolean:
			// OnlyAlias is `boolean[]`; KindBoolean here would mean either
			// the array's element leaked (with the boolean element) — none of
			// a.ts/b.ts use booleans, so finding KindBoolean is conclusive.
			t.Errorf("OnlyAlias leaked from c.ts: found KindBoolean node id=%q", runType.ID)
		case protocol.KindArray:
			// Belt-and-braces — OnlyAlias = boolean[] is the only array
			// in the test set.
			t.Errorf("OnlyAlias leaked from c.ts: found KindArray node id=%q", runType.ID)
		}
	}
}
