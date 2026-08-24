package purefunctions

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/constants"
)

// wrapperDts declares a framework package (@acme/toolkit) that re-exposes the
// anonymous + named registrars behind its own branded wrappers — the shape a
// real framework proxy (mion's serverMapFrom) ships. It lives in its own
// ambient module so the report's calleeModule attribution resolves to
// '@acme/toolkit', NOT '@ts-runtypes/core', even for a wrapper-only call site.
const wrapperDts = `declare module '@acme/toolkit' {
  import type {PureFunction, PureFunctionFactory, InjectPureFnHash, CompTimeArgs, PureFnId, RTUtils} from '@ts-runtypes/core';
  export function registerAcmePureFn<F extends (...args: any[]) => any>(
    fn: PureFunction<F>,
    hash?: InjectPureFnHash<F>,
  ): unknown;
  export function registerAcmeNamed(
    pureFnId: CompTimeArgs<PureFnId>,
    createPureFn: PureFunctionFactory<(utl: RTUtils) => any> | null,
  ): unknown;
  // Leading non-marker param + overloaded name lane — the mion serverMapFrom
  // shape. The marker pair sits at slots 1/2; the string overload carries no
  // markers so name-lane calls never extract.
  export function mapAcmeFrom<Source, MappedInput>(source: Source, fnName: string): unknown;
  export function mapAcmeFrom<Source, MappedInput>(
    source: Source,
    mapper: PureFunction<(value: Source) => MappedInput>,
    hash?: InjectPureFnHash<(value: Source) => MappedInput>,
  ): unknown;
}
`

// entryByKey finds the report record for a key (entries/report are sorted, but
// look up by key for readable assertions).
func siteByKey(sites []PureFnSiteFixture, key string) (PureFnSiteFixture, bool) {
	for _, site := range sites {
		if site.Key == key {
			return site, true
		}
	}
	return PureFnSiteFixture{}, false
}

// PureFnSiteFixture mirrors the fields report assertions read — a thin local
// alias so the test doesn't import protocol just for field access.
type PureFnSiteFixture struct {
	Key, CalleeName, CalleeModule, Lane, Form, Module, Code string
	ParamNames                                              []string
}

func reportFixtures(t *testing.T, emitMode constants.EmitMode, bundled bool) []PureFnSiteFixture {
	t.Helper()
	entries, diags := extractFromOverlay(t, map[string]string{
		"acme.d.ts": wrapperDts,
		"a.ts": `
import {registerPureFnFactory, registerPureFn, registerAnonymousPureFn} from '@ts-runtypes/core';
import {registerAcmePureFn, registerAcmeNamed, mapAcmeFrom} from '@acme/toolkit';

// named + factory (primitive)
export const nf = registerPureFnFactory('acme::mul', (utl) => function _mul(x: number, y: number) { return x * y; });
// named + direct (primitive)
export const nd = registerPureFn('acme::neg', function _neg(x: number) { return -x; });
// anonymous + direct (primitive)
export const ad = registerAnonymousPureFn(function _double(n: number): number { return n * 2; });
// named + factory through a framework wrapper (@acme/toolkit)
export const wf = registerAcmeNamed('acme::wrapped', (utl) => function _w(s: string) { return s; });
// anonymous + direct through a framework wrapper (@acme/toolkit)
export const wd = registerAcmePureFn(function _triple(n: number): number { return n * 3; });
// anonymous + direct through a LEADING-PARAM wrapper (mion serverMapFrom shape):
// the marker pair sits at slots 1/2, discovered by position scan.
export const lm = mapAcmeFrom({id: 4}, (customer: {id: number}): number => customer.id * 4);
// the marker-free string overload of the same wrapper must NOT extract.
export const ln = mapAcmeFrom({id: 5}, 'namedMapper');
`,
	})
	if len(diags) != 0 {
		t.Fatalf("unexpected diagnostics: %+v", diags)
	}
	report := Report(entries, emitMode, bundled)
	out := make([]PureFnSiteFixture, 0, len(report))
	for _, site := range report {
		out = append(out, PureFnSiteFixture{
			Key: site.Key, CalleeName: site.CalleeName, CalleeModule: site.CalleeModule,
			Lane: site.Lane, Form: site.Form, Module: site.Module, Code: site.Code, ParamNames: site.ParamNames,
		})
	}
	return out
}

func TestReport_LanesFormsAndCalleeAttribution(t *testing.T) {
	sites := reportFixtures(t, constants.EmitCode, false)
	if len(sites) != 6 {
		t.Fatalf("expected 6 report records, got %d: %+v", len(sites), sites)
	}

	// Named + factory, primitive registrar.
	if s, ok := siteByKey(sites, "acme::mul"); !ok {
		t.Errorf("missing acme::mul")
	} else {
		if s.Lane != "named" || s.Form != "factory" {
			t.Errorf("acme::mul lane/form = %q/%q, want named/factory", s.Lane, s.Form)
		}
		if s.CalleeName != "registerPureFnFactory" || s.CalleeModule != "@ts-runtypes/core" {
			t.Errorf("acme::mul callee = %q@%q, want registerPureFnFactory@@ts-runtypes/core", s.CalleeName, s.CalleeModule)
		}
		if len(s.ParamNames) != 1 || s.ParamNames[0] != "utl" {
			t.Errorf("acme::mul paramNames = %v, want [utl]", s.ParamNames)
		}
	}

	// Named + direct, primitive registrar.
	if s, ok := siteByKey(sites, "acme::neg"); !ok {
		t.Errorf("missing acme::neg")
	} else if s.Lane != "named" || s.Form != "direct" || s.CalleeName != "registerPureFn" {
		t.Errorf("acme::neg = %q/%q via %q, want named/direct via registerPureFn", s.Lane, s.Form, s.CalleeName)
	}

	// Anonymous + direct, primitive registrar — key is rt::<hash>.
	anon := 0
	for _, s := range sites {
		if s.Lane == "anonymous" {
			anon++
			if s.CalleeModule != "@ts-runtypes/core" && s.CalleeModule != "@acme/toolkit" {
				t.Errorf("anonymous callee module = %q, want a package name", s.CalleeModule)
			}
			if s.Form != "direct" {
				t.Errorf("anonymous form = %q, want direct", s.Form)
			}
		}
	}
	if anon != 3 {
		t.Errorf("expected 3 anonymous records (direct + wrapper + leading-param wrapper), got %d", anon)
	}

	// Wrapper attribution: the framework wrapper resolves to @acme/toolkit, NOT
	// @ts-runtypes/core — the whole point of calleeModule for cross-bundle tooling.
	if s, ok := siteByKey(sites, "acme::wrapped"); !ok {
		t.Errorf("missing acme::wrapped")
	} else if s.CalleeName != "registerAcmeNamed" || s.CalleeModule != "@acme/toolkit" {
		t.Errorf("acme::wrapped callee = %q@%q, want registerAcmeNamed@@acme/toolkit", s.CalleeName, s.CalleeModule)
	}
	// The anonymous wrapper call site attributes to registerAcmePureFn@@acme/toolkit.
	foundAcmeWrapper := false
	for _, s := range sites {
		if s.CalleeName == "registerAcmePureFn" {
			foundAcmeWrapper = true
			if s.CalleeModule != "@acme/toolkit" || s.Lane != "anonymous" {
				t.Errorf("registerAcmePureFn site = %q lane %q, want @acme/toolkit anonymous", s.CalleeModule, s.Lane)
			}
		}
	}
	if !foundAcmeWrapper {
		t.Errorf("no report record attributed to registerAcmePureFn wrapper")
	}

	// Leading-param wrapper (mion serverMapFrom shape): the mapper at slot 1 is
	// extracted and attributed to mapAcmeFrom@@acme/toolkit; the string-overload
	// call (ln) contributed NO record (the 6-count above pins that).
	foundLeadingParamWrapper := false
	for _, s := range sites {
		if s.CalleeName == "mapAcmeFrom" {
			foundLeadingParamWrapper = true
			if s.CalleeModule != "@acme/toolkit" || s.Lane != "anonymous" || s.Form != "direct" {
				t.Errorf("mapAcmeFrom site = %q lane %q form %q, want @acme/toolkit anonymous direct", s.CalleeModule, s.Lane, s.Form)
			}
		}
	}
	if !foundLeadingParamWrapper {
		t.Errorf("no report record attributed to the leading-param mapAcmeFrom wrapper")
	}
}

func TestReport_ModuleBasenameLayoutIndependent(t *testing.T) {
	perEntry := reportFixtures(t, constants.EmitCode, false)
	bundled := reportFixtures(t, constants.EmitCode, true)
	if len(perEntry) != len(bundled) {
		t.Fatalf("record count differs across module modes: %d vs %d", len(perEntry), len(bundled))
	}
	// default/allModules: per-entry pf/<ns>/<fn>. allSingle: the single `pf` bundle.
	for _, s := range perEntry {
		if got := s.Module; got == "" || got == constants.PureFnModuleDir {
			t.Errorf("per-entry module for %s = %q, want pf/<ns>/<fn>", s.Key, got)
		}
	}
	for _, s := range bundled {
		if s.Module != constants.PureFnModuleDir {
			t.Errorf("bundled module for %s = %q, want %q", s.Key, s.Module, constants.PureFnModuleDir)
		}
	}
	// Same keys either way — report shape is identical across moduleMode.
	for _, s := range perEntry {
		if _, ok := siteByKey(bundled, s.Key); !ok {
			t.Errorf("key %s present per-entry but missing in bundled report", s.Key)
		}
	}
}

func TestReport_CodeHonorsEmitMode(t *testing.T) {
	withCode := reportFixtures(t, constants.EmitCode, false)
	for _, s := range withCode {
		if s.Code == "" {
			t.Errorf("emit=code: %s should carry a code body", s.Key)
		}
	}
	noCode := reportFixtures(t, constants.EmitFunctions, false)
	for _, s := range noCode {
		if s.Code != "" {
			t.Errorf("emit=functions: %s should ship no code body, got %q", s.Key, s.Code)
		}
	}
}
