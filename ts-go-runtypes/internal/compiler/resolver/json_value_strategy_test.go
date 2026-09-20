package resolver_test

import (
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// Resolver coverage for the value-level JSON factories: their `strategy` is AxisNone, so it
// selects a whole FAMILY rather than a variant, the same road createParseFn takes.

// jsonValueLooseDTS widens `strategy` to `string`: the only way a value the real union rejects
// can reach the scanner.
const jsonValueLooseDTS = `declare module '@mionjs/run-types' {
  export type InjectTypeFnArgs<T, Fn extends string> = string & {readonly __rtInjectTypeFnArgsBrand?: T; readonly __rtInjectTypeFnArgsFn?: Fn};
  export type CompTimeFnArgs<T> = T & {readonly __rtCompTimeFnArgsBrand?: never};
  export interface LooseOptions {strategy?: string}
  export function createPrepareForJsonFn<T>(val?: T, options?: CompTimeFnArgs<LooseOptions>, id?: InjectTypeFnArgs<T, 'prepareForJsonClone'>): (v: unknown) => unknown;
  export function createRestoreFromJsonFn<T>(val?: T, options?: CompTimeFnArgs<LooseOptions>, id?: InjectTypeFnArgs<T, 'restoreFromJsonClone'>): (v: unknown) => unknown;
}
`

// Clone is the default on BOTH sides, which is what lets a prepare and a restore be written as
// a pair. The negative half is the point: a plain call must emit no other family.
func TestJsonValueFactories_DefaultToTheCloneFamilies(t *testing.T) {
	modules := scanEntryModules(t, `import {createPrepareForJsonFn, createRestoreFromJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const prepare = createPrepareForJsonFn<User>();
export const restore = createRestoreFromJsonFn<User>();
`)
	for _, want := range []string{"prepareForJsonClone", "restoreFromJsonClone"} {
		if _, ok := findEntryWith(modules, familyPrefix(t, want)); !ok {
			t.Fatalf("no %s entry emitted\nmodules: %v", want, keys(modules))
		}
	}
	for _, other := range []string{"prepareForJsonMutate", "restoreFromJsonMutate", "compactForJson", "compactFromJson"} {
		if _, ok := findEntryWith(modules, familyPrefix(t, other)); ok {
			t.Fatalf("default call sites emitted a %s entry\nmodules: %v", other, keys(modules))
		}
	}
}

func TestPrepareForJson_StrategySelectsTheFamily(t *testing.T) {
	for _, row := range []struct{ strategy, opName string }{
		{"clone", "prepareForJsonClone"},
		{"mutate", "prepareForJsonMutate"},
		{"compact", "compactForJson"},
	} {
		t.Run(row.strategy, func(t *testing.T) {
			modules := scanEntryModules(t, `import {createPrepareForJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const prepare = createPrepareForJsonFn<User>(undefined, {strategy: '`+row.strategy+`'});
`)
			if _, ok := findEntryWith(modules, familyPrefix(t, row.opName)); !ok {
				t.Fatalf("strategy %q did not select %s\nmodules: %v", row.strategy, row.opName, keys(modules))
			}
		})
	}
}

func TestRestoreFromJson_StrategySelectsTheFamily(t *testing.T) {
	for _, row := range []struct{ strategy, opName string }{
		{"clone", "restoreFromJsonClone"},
		{"mutate", "restoreFromJsonMutate"},
		{"compact", "compactFromJson"},
	} {
		t.Run(row.strategy, func(t *testing.T) {
			modules := scanEntryModules(t, `import {createRestoreFromJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const restore = createRestoreFromJsonFn<User>(undefined, {strategy: '`+row.strategy+`'});
`)
			if _, ok := findEntryWith(modules, familyPrefix(t, row.opName)); !ok {
				t.Fatalf("strategy %q did not select %s\nmodules: %v", row.strategy, row.opName, keys(modules))
			}
		})
	}
}

// The option-less pair reaches its own family with no options slot to read.
func TestStringifyAndStripFactories_ReachTheirOwnFamily(t *testing.T) {
	modules := scanEntryModules(t, `import {createStringifyJsonFn, createStripUnknownKeysFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const stringify = createStringifyJsonFn<User>();
export const strip = createStripUnknownKeysFn<User>();
`)
	for _, want := range []string{"stringifyJson", "stripUnknownKeysWire"} {
		if _, ok := findEntryWith(modules, familyPrefix(t, want)); !ok {
			t.Fatalf("no %s entry emitted\nmodules: %v", want, keys(modules))
		}
	}
}

// An unrecognised strategy takes the default rather than failing the build — the same
// choice createParseFn makes, and the reason the TS union is the real guard.
func TestJsonValueFactories_UnrecognisedStrategyKeepsTheClone(t *testing.T) {
	const code = `import {createPrepareForJsonFn, createRestoreFromJsonFn} from '@mionjs/run-types';
createPrepareForJsonFn<{a: string}>(undefined, {strategy: 'nonsense'});
createRestoreFromJsonFn<{a: string}>(undefined, {strategy: 'nonsense'});
`
	r := setupInline(t, map[string]string{"runtypes.d.ts": jsonValueLooseDTS, "call.ts": code})
	resp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"call.ts"}})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	if len(resp.Sites) != 2 {
		t.Fatalf("expected 2 Sites, got %d: %+v", len(resp.Sites), resp.Sites)
	}
	want := []string{wantParseFnId(t, "prepareForJsonClone"), wantParseFnId(t, "restoreFromJsonClone")}
	for i, site := range resp.Sites {
		if site.FnId != want[i] {
			t.Errorf("Site[%d].FnId = %q, want the clone family %q", i, site.FnId, want[i])
		}
	}
}

// Marker test coverage rule: both call shapes, plus the equivalence that makes them
// interchangeable.
func TestJsonValueFactories_MarkerStaticForm(t *testing.T) {
	modules := scanEntryModules(t, `import {createPrepareForJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const prepare = createPrepareForJsonFn<User>();
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "prepareForJsonClone")); !ok {
		t.Fatalf("static form emitted no entry\nmodules: %v", keys(modules))
	}
}

func TestJsonValueFactories_MarkerReflectForm(t *testing.T) {
	modules := scanEntryModules(t, `import {createPrepareForJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
const user: User = {id: 1, name: 'a'};
export const prepare = createPrepareForJsonFn(user);
`)
	if _, ok := findEntryWith(modules, familyPrefix(t, "prepareForJsonClone")); !ok {
		t.Fatalf("reflection form emitted no entry\nmodules: %v", keys(modules))
	}
}

func TestJsonValueFactories_MarkerFormEquivalence(t *testing.T) {
	const static_ = `import {createPrepareForJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
export const prepare = createPrepareForJsonFn<User>();
`
	const reflect = `import {createPrepareForJsonFn} from '@mionjs/run-types';
interface User {id: number; name: string}
const user: User = {id: 1, name: 'a'};
export const prepare = createPrepareForJsonFn(user);
`
	r := setupInline(t, map[string]string{"static.ts": static_, "reflect.ts": reflect})
	staticResp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"static.ts"}})
	reflectResp := r.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"reflect.ts"}})
	if staticResp.Error != "" || reflectResp.Error != "" {
		t.Fatalf("scanFiles: %s / %s", staticResp.Error, reflectResp.Error)
	}
	if len(staticResp.Sites) != 1 || len(reflectResp.Sites) != 1 {
		t.Fatalf("expected one site each, got %d / %d", len(staticResp.Sites), len(reflectResp.Sites))
	}
	if staticResp.Sites[0].ID != reflectResp.Sites[0].ID {
		t.Errorf("static id %q != reflection id %q", staticResp.Sites[0].ID, reflectResp.Sites[0].ID)
	}
}
