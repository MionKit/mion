package purefunctions

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
)

// wrapperDts declares a framework package (@acme/toolkit) that re-exposes the
// registrars behind its own branded wrappers — the shape a real framework proxy
// (mion's inputFrom) ships. It lives in its own ambient module so the report's
// calleeModule attribution resolves to '@acme/toolkit', NOT '@mionjs/run-types',
// even for a wrapper-only call site.
const wrapperDts = `declare module '@acme/toolkit' {
  import type {PureFunction, PureFunctionFactory, InjectPureFnId, RTUtils} from '@mionjs/run-types';
  export function registerAcmePureFn<F extends (...args: any[]) => any>(
    fn: PureFunction<F>,
    id?: InjectPureFnId<F>,
  ): unknown;
  export function registerAcmeFactory(
    createPureFn: PureFunctionFactory<(utl: RTUtils) => any> | null,
    id?: InjectPureFnId<(utl: RTUtils) => any>,
  ): unknown;
  // Leading non-marker param before the marker pair — the mion inputFrom shape.
  export function mapAcmeFrom<Source, MappedInput>(
    source: Source,
    mapper: PureFunction<(value: Source) => MappedInput>,
    id?: InjectPureFnId<(value: Source) => MappedInput>,
  ): unknown;
}
`

// siteByKey finds the report record for an id (entries/report are sorted, but
// look up by id for readable assertions).
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
	Key, CalleeName, CalleeModule, Form, Module, Code string
	ParamNames                                        []string
}

func reportFixtures(t *testing.T, emitMode constants.EmitMode, bundled bool) []PureFnSiteFixture {
	t.Helper()
	entries, diags := extractFromOverlay(t, map[string]string{
		"acme.d.ts": wrapperDts,
		"a.ts": `
import {registerPureFnFactory, registerPureFn} from '@mionjs/run-types';
import {registerAcmePureFn, registerAcmeFactory, mapAcmeFrom} from '@acme/toolkit';

// factory form, primitive registrar
export const mul = registerPureFnFactory((utl) => function _mul(x: number, y: number) { return x * y; });
// direct form, primitive registrar
export const neg = registerPureFn(function _neg(x: number) { return -x; });
// factory form through a framework wrapper (@acme/toolkit)
export const wrapped = registerAcmeFactory((utl) => function _w(s: string) { return s; });
// direct form through a framework wrapper (@acme/toolkit)
export const triple = registerAcmePureFn(function _triple(n: number): number { return n * 3; });
// direct form through a LEADING-PARAM wrapper (the mion inputFrom shape): the
// marker pair sits at slots 1/2, discovered by position scan.
export const mapped = mapAcmeFrom({id: 4}, (customer: {id: number}): number => customer.id * 4);
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
			Form: site.Form, Module: site.Module, Code: site.Code, ParamNames: site.ParamNames,
		})
	}
	return out
}

func TestReport_FormsAndCalleeAttribution(t *testing.T) {
	sites := reportFixtures(t, constants.EmitCode, false)
	if len(sites) != 5 {
		t.Fatalf("expected 5 report records, got %d: %+v", len(sites), sites)
	}

	// Factory form, primitive registrar.
	if s, ok := siteByKey(sites, idOf("a.ts", "mul")); !ok {
		t.Errorf("missing the mul record")
	} else {
		if s.Form != "factory" {
			t.Errorf("mul form = %q, want factory", s.Form)
		}
		if s.CalleeName != "registerPureFnFactory" || s.CalleeModule != "@mionjs/run-types" {
			t.Errorf("mul callee = %q@%q, want registerPureFnFactory@@mionjs/run-types", s.CalleeName, s.CalleeModule)
		}
		if len(s.ParamNames) != 1 || s.ParamNames[0] != "utl" {
			t.Errorf("mul paramNames = %v, want [utl]", s.ParamNames)
		}
	}

	// Direct form, primitive registrar.
	if s, ok := siteByKey(sites, idOf("a.ts", "neg")); !ok {
		t.Errorf("missing the neg record")
	} else if s.Form != "direct" || s.CalleeName != "registerPureFn" {
		t.Errorf("neg = %q via %q, want direct via registerPureFn", s.Form, s.CalleeName)
	}

	// Wrapper attribution: a framework wrapper resolves to @acme/toolkit, NOT
	// @mionjs/run-types — the whole point of calleeModule for cross-bundle tooling.
	for _, name := range []string{"wrapped", "triple", "mapped"} {
		s, ok := siteByKey(sites, idOf("a.ts", name))
		if !ok {
			t.Errorf("missing the %s record", name)
			continue
		}
		if s.CalleeModule != "@acme/toolkit" {
			t.Errorf("%s callee module = %q, want @acme/toolkit", name, s.CalleeModule)
		}
	}
	if s, _ := siteByKey(sites, idOf("a.ts", "wrapped")); s.CalleeName != "registerAcmeFactory" || s.Form != "factory" {
		t.Errorf("wrapped = %q/%q, want registerAcmeFactory/factory", s.CalleeName, s.Form)
	}
	if s, _ := siteByKey(sites, idOf("a.ts", "mapped")); s.CalleeName != "mapAcmeFrom" || s.Form != "direct" {
		t.Errorf("mapped = %q/%q, want mapAcmeFrom/direct", s.CalleeName, s.Form)
	}
}

func TestReport_ModuleBasenameLayoutIndependent(t *testing.T) {
	perEntry := reportFixtures(t, constants.EmitCode, false)
	bundled := reportFixtures(t, constants.EmitCode, true)
	if len(perEntry) != len(bundled) {
		t.Fatalf("record count differs across module modes: %d vs %d", len(perEntry), len(bundled))
	}
	// default/allModules: per-entry pf/<id>. allSingle: the single `pf` bundle.
	for _, s := range perEntry {
		if got := s.Module; got == "" || got == constants.PureFnModuleDir {
			t.Errorf("per-entry module for %s = %q, want pf/<id>", s.Key, got)
		}
	}
	for _, s := range bundled {
		if s.Module != constants.PureFnModuleDir {
			t.Errorf("bundled module for %s = %q, want %q", s.Key, s.Module, constants.PureFnModuleDir)
		}
	}
	// Same ids either way — report shape is identical across moduleMode.
	for _, s := range perEntry {
		if _, ok := siteByKey(bundled, s.Key); !ok {
			t.Errorf("id %s present per-entry but missing in bundled report", s.Key)
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
