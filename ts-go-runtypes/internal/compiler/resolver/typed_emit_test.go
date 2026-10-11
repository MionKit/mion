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

// tupleAnnotation is an export's tuple type, which only emitMode ts writes.
var tupleAnnotation = regexp.MustCompile(`(export const [A-Za-z0-9_$]+): [A-Za-z]+Tuple=`)

// tupleHead is a tuple's kind, deps and ini slots; emitMode ts spells an absent one `undefined` where the JS modes hole it.
var tupleHead = regexp.MustCompile(`=\[([^,]+),(undefined|\(\)=>\[[^\]]*\]|rtL|),(undefined|ini\d*|),`)

func holeHead(match string) string {
	return strings.ReplaceAll(match, "undefined", "")
}

// moduleHead is a module's text up to its live factory, the factory slot opening outside any quoted string, with the
// type-only imports and tuple annotations emitMode ts adds removed: everything else must match byte for byte.
func moduleHead(module string) string {
	var lines []string
	for _, line := range strings.SplitAfter(module, "\n") {
		if !strings.HasPrefix(line, "import type ") && !strings.HasPrefix(line, "declare const ") {
			lines = append(lines, line)
		}
	}
	text := tupleAnnotation.ReplaceAllString(strings.Join(lines, ""), "$1=")
	text = strings.ReplaceAll(text, "(rtu: RTUtils){const c=(id: string)=>", "(rtu){const c=(id)=>")
	text = tupleHead.ReplaceAllStringFunc(text, holeHead)
	quoted := false
	for i := 0; i < len(text); i++ {
		switch {
		case quoted && text[i] == '\\':
			i++
		case text[i] == '\'':
			quoted = !quoted
		case !quoted && strings.HasPrefix(text[i:], ",function"):
			return text[:i]
		}
	}
	return text
}

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
		if bothHead, typedHead := moduleHead(bothModule), moduleHead(typedModule); bothHead != typedHead {
			t.Errorf("module %q: ts mode changed what it ships\nboth: %s\nts:   %s", name, bothHead, typedHead)
		}
		if strings.Contains(typedModule, "(utl: RTUtils)") {
			typedFactories++
		}
	}
	for name := range typed {
		if _, ok := both[name]; !ok && !strings.HasPrefix(name, constants.TypeModuleDir+"/") {
			t.Errorf("ts mode rendered %q, which both does not", name)
		}
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

// TestTypedEmit_OneTypeModulePerID: every T_ a typed module names resolves to one type module, printing the data-only
// projection with children by reference.
func TestTypedEmit_OneTypeModulePerID(t *testing.T) {
	typed := typedEmitModules(t, constants.EmitTS)
	typeRef := regexp.MustCompile(`\bT_([A-Za-z0-9_-]+)\b`)
	user := ""
	for name, module := range typed {
		for _, match := range typeRef.FindAllStringSubmatch(module, -1) {
			if _, ok := typed[constants.TypeModuleDir+"/"+match[1]]; !ok {
				t.Errorf("module %q names %s, which has no type module", name, match[0])
			}
		}
		if strings.Contains(module, "/** User */") {
			user = module
		}
	}
	if user == "" {
		t.Fatal("no type module for User")
	}
	if strings.Contains(user, "greet") || strings.Contains(user, "street") || !strings.Contains(user, "address: T_") {
		t.Errorf("User should drop its method and reference Address:\n%s", user)
	}
}
