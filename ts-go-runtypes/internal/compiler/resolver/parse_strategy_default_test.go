package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/cachegen/operations"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// parseStrategyDTS declares createParseFn with its `strategy` option so the
// scanner reads it off the call-site options literal. Unlike numberMode the
// strategy does not fork a VARIANT: parse is AxisNone, so each value selects a
// different FAMILY and the injected fnId is that family's plain hash.
const parseStrategyDTS = `declare module '@mionjs/run-types' {
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export interface ParseOptions {strategy?: 'preserve' | 'strip' | 'fail'}
  export function createParseFn<T>(val?: T, options?: CompTimeFnArgs<ParseOptions>, id?: InjectTypeFnArgs<T, 'prs'>): (v: unknown) => T;
}
`

func wantParseFnId(t *testing.T, opName string) string {
	t.Helper()
	op, ok := operations.ByName(opName)
	if !ok {
		t.Fatalf("%s op not registered", opName)
	}
	return operations.FnHashFor(op, nil, "", false)
}

// A project-wide parse.strategy fills in for any site that did not name one, and
// a site that did keeps its own — the same site-wins merge validate.numberMode
// uses. The point of having it: a project that wants every payload cleaned says
// so once, in tsconfig, rather than at every call.
func TestParseStrategy_GlobalDefaultFillsInPerSite(t *testing.T) {
	const code = `import {createParseFn} from '@mionjs/run-types';
createParseFn<{a: string}>();
createParseFn<{a: string}>(undefined, {strategy: 'preserve'});
createParseFn<{a: string}>(undefined, {strategy: 'fail'});
`
	r := setupInlineWith(t, map[string]string{"runtypes.d.ts": parseStrategyDTS, "call.ts": code},
		func(_ *program.Options, ro *resolver.Options) {
			ro.ParseDefaults = resolver.ParseDefaults{Strategy: "strip"}
		})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 3 {
		t.Fatalf("expected 3 Sites, got %d: %+v", len(resp.Sites), resp.Sites)
	}
	want := []string{
		wantParseFnId(t, "parseStrip"), // no site strategy, so the default fills in
		wantParseFnId(t, "parse"),      // an explicit 'preserve' opts back out
		wantParseFnId(t, "parseFail"),  // a site strategy wins over the default
	}
	for i, site := range resp.Sites {
		if site.FnId != want[i] {
			t.Errorf("Site[%d].FnId = %q, want %q", i, site.FnId, want[i])
		}
	}
}

// With no project default set, every site keeps the built-in `preserve`. Pinned
// so adding the default cannot quietly change what a plain call compiles to.
func TestParseStrategy_NoDefaultLeavesEverySiteLoose(t *testing.T) {
	const code = `import {createParseFn} from '@mionjs/run-types';
createParseFn<{a: string}>();
createParseFn<{a: string}>(undefined, {strategy: 'strip'});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": parseStrategyDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 Sites, got %d: %+v", len(resp.Sites), resp.Sites)
	}
	want := []string{wantParseFnId(t, "parse"), wantParseFnId(t, "parseStrip")}
	for i, site := range resp.Sites {
		if site.FnId != want[i] {
			t.Errorf("Site[%d].FnId = %q, want %q", i, site.FnId, want[i])
		}
	}
}
