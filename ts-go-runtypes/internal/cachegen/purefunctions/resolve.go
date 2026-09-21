package purefunctions

import (
	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/checker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/marker"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
)

// An id is the hash of the body that SHIPS, and that body carries its dependencies' ids, so
// resolving one registration can require resolving another in a file the walk has not reached, and
// the work that answers "what is this id" is the work that produces the code the cache stores.
//
// resolveCtx keeps that from being paid twice: one entry per registration per Program, memoised the
// first time anybody asks, be it the file walk, a dependent lowering it, or a batch.
type resolveCtx struct {
	typeChecker *checker.Checker
	markerOpts  marker.Options
	resolved    map[*ast.Node]resolvedEntry
	inProgress  map[*ast.Node]bool
}

// resolvedEntry memoises what one registration produced, diagnostics included,
// so a dependency extracted on demand reports its findings against ITS file
// rather than against whichever dependent reached it first.
type resolvedEntry struct {
	entry *Entry
	diags []diagnostics.Diagnostic
}

func newResolveCtx(typeChecker *checker.Checker, markerOpts marker.Options) *resolveCtx {
	return &resolveCtx{
		typeChecker: typeChecker,
		markerOpts:  marker.WithDefaults(markerOpts),
		resolved:    map[*ast.Node]resolvedEntry{},
		inProgress:  map[*ast.Node]bool{},
	}
}

// entryFor returns the finished entry for one registration, computing it at most once. cycle is
// true when the call is already being resolved further up the stack: its id would have to contain
// itself, so the caller reports PFE9015 rather than recursing forever.
//
// The call NODE is the key, not its position: a call and the member call wrapping it
// (`inputFrom(…).asArg()`) start at the same offset. Nodes live exactly as long as the memo, one
// per Program.
func (ctx *resolveCtx) entryFor(sourceFile *ast.SourceFile, call *ast.Node) (*Entry, []diagnostics.Diagnostic, bool) {
	key := call
	if memo, found := ctx.resolved[key]; found {
		return memo.entry, memo.diags, false
	}
	if ctx.inProgress[key] {
		return nil, nil, true
	}
	ctx.inProgress[key] = true
	entry, diags := ctx.extractOne(sourceFile, call)
	delete(ctx.inProgress, key)
	ctx.resolved[key] = resolvedEntry{entry: entry, diags: diags}
	return entry, diags, false
}
