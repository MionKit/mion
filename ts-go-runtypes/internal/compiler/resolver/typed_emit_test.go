package resolver_test

import (
	"regexp"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// typedEmitSource reaches every family shape a typed factory can take: a dep-calling validator, the errors family,
// JSON composites over a Date and a Map, a union, a recursive type, a class with a method and the strip family.
const typedEmitSource = `import {createValidateFn, createGetValidationErrorsFn, createJsonEncoderFn, createJsonDecoderFn,
  createRemoveUnknownKeysFn, createPrepareForJsonFn, createRestoreFromJsonFn, createFormatTransformFn, getRunTypeId} from '@mionjs/run-types';
export interface Address {street: string; zip: number; tags?: string[]}
export class Account {constructor(public id: number, public opened: Date) {} close(): void {}}
export enum Role {Admin = 'admin', User = 'user'}
export interface User {id: number; name: string; email?: string; createdAt: Date; address: Address; roles: ('admin' | 'user')[];
  meta: Record<string, number>; lookup: Map<string, Address>; big: bigint; account: Account; role: Role; greet(): string}
export type Shape = {kind: 'circle'; r: number} | {kind: 'square'; side: number};
export interface TreeNode {value: string; children: TreeNode[]}
export const isUser = createValidateFn<User>();
export const strictUser = createValidateFn<User>(undefined, {checkUnknowns: true});
export const userErrors = createGetValidationErrorsFn<User>();
export const isShape = createValidateFn<Shape>();
export const isTree = createValidateFn<TreeNode>();
export const encodeUser = createJsonEncoderFn<User>();
export const decodeUser = createJsonDecoderFn<User>();
export const compactUser = createJsonEncoderFn<User>(undefined, {strategy: 'compact'});
export const stripUser = createRemoveUnknownKeysFn<User>();
export const prepareShape = createPrepareForJsonFn<Shape>();
export const restoreShape = createRestoreFromJsonFn<Shape>();
export const formatTree = createFormatTransformFn<TreeNode>();
export const userId = getRunTypeId<User>();
const sample: TreeNode = {value: 'a', children: []};
export const treeId = getRunTypeId(sample);
`

func typedEmitModules(t *testing.T, mode constants.EmitMode) map[string]string {
	t.Helper()
	session := setupInlineWith(t, map[string]string{"a.ts": typedEmitSource}, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.EmitMode = mode
	})
	resp := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: []string{"a.ts"}, IncludeEntryModules: true})
	if resp.Error != "" {
		t.Fatalf("scan (%s): %s", mode, resp.Error)
	}
	return resp.EntryModules
}

// tupleHeads cuts each exported tuple before its live factory: everything a module ships but the factory itself.
var tupleHeads = regexp.MustCompile(`(?s)export const [^=]+=\[.*?(?:,function g_|\];)`)

// TestTypedEmit_CodeSlotMatchesBoth: emitMode ts ships the exact code strings both does, and only its factories are typed.
func TestTypedEmit_CodeSlotMatchesBoth(t *testing.T) {
	both := typedEmitModules(t, constants.EmitBoth)
	typed := typedEmitModules(t, constants.EmitTS)
	typedFactories := 0
	for name, bothModule := range both {
		typedModule, ok := typed[name]
		if !ok {
			t.Errorf("module %q missing in ts mode", name)
			continue
		}
		if strings.Contains(bothModule, "\x02") || strings.Contains(typedModule, "\x02") {
			t.Errorf("module %q leaked a type mark", name)
		}
		if strings.Contains(bothModule, "RTUtils") {
			t.Errorf("both-mode module %q carries a type annotation:\n%s", name, bothModule)
		}
		bothHeads := tupleHeads.FindAllString(bothModule, -1)
		typedHeads := tupleHeads.FindAllString(typedModule, -1)
		if strings.Join(bothHeads, "\n") != strings.Join(typedHeads, "\n") {
			t.Errorf("module %q: ts mode changed a tuple head\nboth: %s\nts:   %s", name, bothHeads, typedHeads)
		}
		if strings.Contains(typedModule, "(utl: RTUtils)") {
			typedFactories++
		}
	}
	if len(typed) != len(both) {
		t.Errorf("ts mode rendered %d modules, both %d", len(typed), len(both))
	}
	if typedFactories == 0 {
		t.Fatal("no typed factory rendered")
	}
}

// TestTypedEmit_FactoryCarriesFamilySignatures: each family's factory states its fn type over the root's type ref.
func TestTypedEmit_FactoryCarriesFamilySignatures(t *testing.T) {
	typed := typedEmitModules(t, constants.EmitTS)
	all := strings.Join(sortedModuleBodies(typed), "\n")
	for _, want := range []string{
		"(utl: RTUtils): (v: unknown) => v is T_",
		"(v: unknown, pth?: RTValidationErrorPathSegment[], er?: RTValidationError[]) => RTValidationError[]",
		"(v: any,pth: RTValidationErrorPathSegment[]=[],er: RTValidationError[]=[]): RTValidationError[]",
		"(utl: RTUtils): (v: T_",
		"(utl: RTUtils): (s: string) => T_",
		"utl.getRT<(v: unknown) => v is T_",
		"')!",
	} {
		if !strings.Contains(all, want) {
			t.Errorf("no typed module contains %q", want)
		}
	}
}

func sortedModuleBodies(modules map[string]string) []string {
	bodies := make([]string, 0, len(modules))
	for _, name := range sortedEntryNames(modules) {
		bodies = append(bodies, modules[name])
	}
	return bodies
}
