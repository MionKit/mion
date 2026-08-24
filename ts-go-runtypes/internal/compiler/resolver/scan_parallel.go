package resolver

import (
	"context"
	"fmt"
	"sync"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/ts-runtypes/internal/diagnostics"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// Parallel marker scan — the two-phase split of dispatchScanFilesSerial.
//
// Phase 1 fans the checker-bound analysis (analyzeCall: signature
// resolution, marker detection, comptime/purity checks, diagnostics) out
// across the Program's checker pool: the request's files are partitioned
// by the pool's own file→checker association and each group runs on its
// assigned checker in its own goroutine. A single checker is never shared
// between goroutines — concurrency comes from N checkers, which is tsgo's
// own supported parallel-check mode.
//
// Phase 2 replays the captured results on the dispatch goroutine in exact
// request order: cache projection (AssignIDUnder, under each type's
// owning checker), Site assembly, per-file scope recording. Because the
// commit order equals the serial path's order, hash-dict interning — and
// therefore every wire id — is identical to a serial scan of the same
// request. The only tolerated divergence is the member ORDER inside a
// projected union node (Distributed() order is per-checker type-creation
// history), which is behaviorally equivalent and already varies across
// sessions today.

// scanGroup is one checker's slice of a parallel scan: the pool checker
// assigned to these files and the request indices it owns.
type scanGroup struct {
	scanChecker *checker.Checker
	// leader is the group's first file — it anchors the exclusive
	// checker lease the group goroutine takes for the whole pass.
	leader *ast.SourceFile
	// fileIndexes are indices into the request's files slice, in
	// request order.
	fileIndexes []int
}

// analyzedCall is one analyzeCall result captured during phase 1 and
// replayed in order by the serial commit phase. pendings carries every marker
// slot the call injects (0 for a diagnostics-only call, 1 for the common
// single-marker case, N for multi-slot injection).
type analyzedCall struct {
	pendings    []pendingCall
	diagnostics []diagnostics.Diagnostic
}

// planScanGroups resolves every requested file up front and partitions
// the request by the pool's own file→checker association.
// GetTypeCheckerForFile is a lock-free association lookup in our pool
// configuration (non-exclusive, noop release), so planning is cheap.
// Group order is first-appearance order over the request — deterministic
// for a given Program + request.
func (sess *Session) planScanGroups(files []string) ([]*ast.SourceFile, []scanGroup, error) {
	sourceFiles := make([]*ast.SourceFile, len(files))
	var groups []scanGroup
	groupIndexByChecker := map[*checker.Checker]int{}
	for fileIndex, file := range files {
		sourceFile, err := sess.sourceFile(file)
		if err != nil {
			return nil, nil, err
		}
		sourceFiles[fileIndex] = sourceFile
		scanChecker, release := sess.Program.TS.GetTypeCheckerForFile(context.Background(), sourceFile)
		release()
		if scanChecker == nil {
			return nil, nil, fmt.Errorf("no checker available for file: %s", file)
		}
		groupIndex, ok := groupIndexByChecker[scanChecker]
		if !ok {
			groupIndex = len(groups)
			groupIndexByChecker[scanChecker] = groupIndex
			groups = append(groups, scanGroup{scanChecker: scanChecker, leader: sourceFile})
		}
		groups[groupIndex].fileIndexes = append(groups[groupIndex].fileIndexes, fileIndex)
	}
	return sourceFiles, groups, nil
}

// dispatchScanFilesParallel is the parallel counterpart of
// dispatchScanFilesSerial. It degrades to the serial loop whenever the
// request can't honestly be parallelized — a file fails to resolve
// (serial reproduces the established partial-scan + error semantics) or
// every file lands on one checker.
func (sess *Session) dispatchScanFilesParallel(files []string) ([]protocol.Site, []diagnostics.Diagnostic, error) {
	sourceFiles, groups, err := sess.planScanGroups(files)
	if err != nil || len(groups) < 2 {
		return sess.dispatchScanFilesSerial(files)
	}
	// Build every group's scanState on this goroutine: verdictsFor mutates
	// the resolver-level memo registry, which must never happen
	// concurrently. Each goroutine then only writes its own inner memo.
	states := make([]scanState, len(groups))
	for groupIndex, group := range groups {
		states[groupIndex] = sess.scanStateFor(group.scanChecker)
	}
	// Per-file result slots and per-group error slots: every goroutine
	// writes only the indices it owns, so the fan-out shares no mutable
	// state beyond pre-sized slices.
	analyzed := make([][]analyzedCall, len(files))
	groupErrors := make([]error, len(groups))
	var waitGroup sync.WaitGroup
	for groupIndex, group := range groups {
		waitGroup.Add(1)
		go func() {
			defer waitGroup.Done()
			defer func() {
				if recovered := recover(); recovered != nil {
					groupErrors[groupIndex] = fmt.Errorf("parallel scan (checker group %d): %v", groupIndex, recovered)
				}
			}()
			// Exclusive lease on this group's checker for the whole pass.
			// Mutual exclusion between groups already comes from the
			// partition itself; the lease is defense-in-depth against any
			// other in-process pool user.
			_, release := sess.Program.TS.GetTypeCheckerForFileExclusive(context.Background(), group.leader)
			defer release()
			state := states[groupIndex]
			for _, fileIndex := range group.fileIndexes {
				file := files[fileIndex]
				var calls []analyzedCall
				forEachCallExpression(sourceFiles[fileIndex], func(call *ast.Node) bool {
					pendings, diags := state.analyzeCall(file, call)
					if len(pendings) > 0 || len(diags) > 0 {
						calls = append(calls, analyzedCall{pendings: pendings, diagnostics: diags})
					}
					return true
				})
				analyzed[fileIndex] = calls
			}
		}()
	}
	waitGroup.Wait()
	// First error in group order wins — deterministic regardless of which
	// goroutine failed first in wall-clock time.
	for _, groupError := range groupErrors {
		if groupError != nil {
			return nil, nil, groupError
		}
	}
	// Phase 2: serial commit in request order. Mirrors the serial loop's
	// per-file body exactly so site order, diagnostic order, cache intern
	// order, and the per-file bookkeeping all match.
	var sites []protocol.Site
	var diagnostics []diagnostics.Diagnostic
	for fileIndex, file := range files {
		fileStart := len(sites)
		for _, call := range analyzed[fileIndex] {
			if len(call.diagnostics) > 0 {
				diagnostics = append(diagnostics, call.diagnostics...)
			}
			for _, pending := range call.pendings {
				site, depthDiags, emitSite := sess.commitPending(pending)
				if len(depthDiags) > 0 {
					diagnostics = append(diagnostics, depthDiags...)
				}
				if emitSite {
					sites = append(sites, site)
					sess.sites = append(sess.sites, site)
				}
			}
		}
		sess.markFileScanned(file, sites[fileStart:])
	}
	return sites, diagnostics, nil
}
