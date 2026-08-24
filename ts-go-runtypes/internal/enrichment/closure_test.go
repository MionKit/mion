package enrichment_test

import (
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/ts-runtypes/internal/compiler/program"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/enrichment"
)

// resolveRawFixture mirrors resolveFixture (bridge_test.go) but returns the RAW
// (non-inlined) projected node via ResolveTypeRaw — the shape EmitClosure walks
// so it can tell a named-type reference from an anonymous inline shape.
func resolveRawFixture(t *testing.T, relPath, typeName string, sources map[string]string) *enrichment.Resolved {
	t.Helper()
	cwd := tspath.NormalizePath(t.TempDir())
	overlay := make(map[string]string, len(sources))
	fileNames := make([]string, 0, len(sources))
	var absTarget string
	for rel, code := range sources {
		abs := tspath.ResolvePath(cwd, rel)
		overlay[abs] = code
		fileNames = append(fileNames, abs)
		if rel == relPath {
			absTarget = abs
		}
	}

	prog, err := program.NewInferred(program.Options{Cwd: cwd, Overlay: overlay}, fileNames)
	if err != nil {
		t.Fatalf("program.NewInferred: %v", err)
	}
	res, err := resolver.New(prog, resolver.Options{Cwd: cwd})
	if err != nil {
		t.Fatalf("resolver.New: %v", err)
	}
	t.Cleanup(res.Close)

	resolved, err := enrichment.ResolveTypeRaw(prog, res.Checker(), res.Cache(), absTarget, typeName)
	if err != nil {
		t.Fatalf("ResolveTypeRaw(%s): %v", typeName, err)
	}
	return resolved
}

func emitClosure(t *testing.T, relPath, typeName string, sources map[string]string) []enrichment.NamedConst {
	t.Helper()
	resolved := resolveRawFixture(t, relPath, typeName, sources)
	return enrichment.EmitClosure(resolved.Node, enrichment.ClosureOptions{
		TypeName:  typeName,
		Resolve:   resolved.Resolve,
		DeclFiles: resolved.DeclFiles,
	})
}

// TestEmitClosure_DeclFileCrossFile: a User in user.ts referencing an Address
// declared in address.ts stamps each NamedConst.DeclFile with its own
// declaration source file, so the caller can split the mirror tree cross-file.
func TestEmitClosure_DeclFileCrossFile(t *testing.T) {
	closure := emitClosure(t, "user.ts", "User", map[string]string{
		"address.ts": "export interface Address { street: string }\n",
		"user.ts": "import type { Address } from './address';\n" +
			"export interface User { name: string; address: Address }\n",
	})
	_, user := findConst(closure, "User")
	_, addr := findConst(closure, "Address")
	if user.DeclFile == "" || addr.DeclFile == "" {
		t.Fatalf("DeclFile not populated: User=%q Address=%q", user.DeclFile, addr.DeclFile)
	}
	if !strings.HasSuffix(user.DeclFile, "user.ts") {
		t.Errorf("User DeclFile = %q, want suffix user.ts", user.DeclFile)
	}
	if !strings.HasSuffix(addr.DeclFile, "address.ts") {
		t.Errorf("Address DeclFile = %q, want suffix address.ts", addr.DeclFile)
	}
	if user.DeclFile == addr.DeclFile {
		t.Errorf("User and Address should have distinct DeclFiles; both = %q", user.DeclFile)
	}
}

// TestEmitClosure_DeclFileSameFile: two interfaces in one file share a DeclFile.
func TestEmitClosure_DeclFileSameFile(t *testing.T) {
	closure := emitClosure(t, "models.ts", "User", map[string]string{
		"models.ts": "export interface Address { street: string }\n" +
			"export interface User { name: string; address: Address }\n",
	})
	_, user := findConst(closure, "User")
	_, addr := findConst(closure, "Address")
	if user.DeclFile == "" || user.DeclFile != addr.DeclFile {
		t.Errorf("same-file types should share DeclFile: User=%q Address=%q", user.DeclFile, addr.DeclFile)
	}
	if !strings.HasSuffix(user.DeclFile, "models.ts") {
		t.Errorf("DeclFile = %q, want suffix models.ts", user.DeclFile)
	}
}

// findConst returns the NamedConst with the given source TypeName and its index,
// or (-1, zero) when absent.
func findConst(closure []enrichment.NamedConst, typeName string) (int, enrichment.NamedConst) {
	for i, named := range closure {
		if named.TypeName == typeName {
			return i, named
		}
	}
	return -1, enrichment.NamedConst{}
}

// TestEmitClosure_TypeIDAndChildIDs: each NamedConst carries its type's
// structural id (TypeID) and a dotted-path → child-id map (ChildIDs) for the
// reconcile markers. A named-type field's id is recorded but the walk does NOT
// descend into it (it owns its own const); an inline object's children ARE
// recorded at dotted paths.
func TestEmitClosure_TypeIDAndChildIDs(t *testing.T) {
	closure := emitClosure(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface Address { street: string }\n" +
			"export interface User { name: string; address: Address; profile: { email: string } }\n",
	})
	_, user := findConst(closure, "User")
	if user.TypeID == "" {
		t.Fatalf("User TypeID not populated")
	}
	if user.ChildIDs == nil {
		t.Fatalf("User ChildIDs not populated")
	}
	// Direct fields recorded.
	if user.ChildIDs["name"] == "" {
		t.Errorf("ChildIDs missing 'name'; got %v", user.ChildIDs)
	}
	if user.ChildIDs["address"] == "" {
		t.Errorf("ChildIDs missing 'address' (named-type ref id still recorded); got %v", user.ChildIDs)
	}
	// The inline `profile` object's child is recorded at a dotted path.
	if user.ChildIDs["profile"] == "" || user.ChildIDs["profile.email"] == "" {
		t.Errorf("ChildIDs missing inline 'profile'/'profile.email'; got %v", user.ChildIDs)
	}
	// The walk does NOT descend into the named Address (it owns its own const):
	// no `address.street` entry.
	if _, ok := user.ChildIDs["address.street"]; ok {
		t.Errorf("ChildIDs should not descend into named-type Address; got %v", user.ChildIDs)
	}

	// Address const records its own field.
	_, addr := findConst(closure, "Address")
	if addr.TypeID == "" || addr.ChildIDs["street"] == "" {
		t.Errorf("Address TypeID/ChildIDs not populated: id=%q ids=%v", addr.TypeID, addr.ChildIDs)
	}
	// The named-type field's recorded id equals the Address const's TypeID.
	if user.ChildIDs["address"] != addr.TypeID {
		t.Errorf("User.ChildIDs[address] = %q, want Address.TypeID %q", user.ChildIDs["address"], addr.TypeID)
	}
}

// TestEmitClosure_Acyclic: a field whose type is another NAMED type is a const
// reference, NOT an inlined body; the closure yields two consts in topological
// order (Address before User).
func TestEmitClosure_Acyclic(t *testing.T) {
	closure := emitClosure(t, "user.ts", "User", map[string]string{
		"user.ts": "export interface Address { street: string }\n" +
			"export interface User { name: string; address: Address }\n",
	})
	if len(closure) != 2 {
		t.Fatalf("want 2 consts (User + Address), got %d: %+v", len(closure), closure)
	}

	addrIdx, addr := findConst(closure, "Address")
	userIdx, user := findConst(closure, "User")
	if addrIdx < 0 || userIdx < 0 {
		t.Fatalf("missing a const; got %+v", closure)
	}
	// Topological order: the referenced type (Address) is declared before User.
	if addrIdx >= userIdx {
		t.Errorf("topological order broken: Address at %d, User at %d", addrIdx, userIdx)
	}
	// User's friendly body references friendlyAddress, NOT an inlined {street:…}.
	if !strings.Contains(user.Friendly, "address: friendlyAddress") {
		t.Errorf("friendlyUser should reference friendlyAddress; got:\n%s", user.Friendly)
	}
	if strings.Contains(user.Friendly, "street") {
		t.Errorf("friendlyUser must NOT inline Address (no 'street'); got:\n%s", user.Friendly)
	}
	// Mock body likewise references mockAddress.
	if !strings.Contains(user.Mock, "address: mockAddress") {
		t.Errorf("mockUser should reference mockAddress; got:\n%s", user.Mock)
	}
	// Address const is defined and inlines its own field.
	if !strings.Contains(addr.Friendly, "street:") {
		t.Errorf("friendlyAddress should define 'street'; got:\n%s", addr.Friendly)
	}
	// Var names follow friendly<Name> / mock<Name>.
	if user.FriendlyVar != "friendlyUser" || user.MockVar != "mockUser" {
		t.Errorf("User var names: got friendly=%q mock=%q", user.FriendlyVar, user.MockVar)
	}
	if addr.FriendlyVar != "friendlyAddress" || addr.MockVar != "mockAddress" {
		t.Errorf("Address var names: got friendly=%q mock=%q", addr.FriendlyVar, addr.MockVar)
	}
}

// TestEmitClosure_Circular: A↔B mutually reference. Two consts; the back-edge is a
// leaf (no const reference), the forward edge a const reference, so the declared
// const graph never hits a TDZ (a referenced var is declared before use).
func TestEmitClosure_Circular(t *testing.T) {
	closure := emitClosure(t, "ab.ts", "A", map[string]string{
		"ab.ts": "export interface A { id: string; b: B }\n" +
			"export interface B { id: string; a: A }\n",
	})
	if len(closure) != 2 {
		t.Fatalf("want 2 consts (A + B), got %d: %+v", len(closure), closure)
	}
	aIdx, a := findConst(closure, "A")
	bIdx, b := findConst(closure, "B")
	if aIdx < 0 || bIdx < 0 {
		t.Fatalf("missing a const; got %+v", closure)
	}

	// Exactly one of the two edges is broken to a leaf; the other is a forward
	// const reference. The emit starts at A → descends into B (in-progress) → B's
	// edge back to A breaks. So B references nothing (a:{rt$label:''}) and A
	// references friendlyB.
	leafEdges := 0
	refEdges := 0
	for _, named := range closure {
		if strings.Contains(named.Friendly, "friendlyA") || strings.Contains(named.Friendly, "friendlyB") {
			refEdges++
		}
	}
	for _, named := range []enrichment.NamedConst{a, b} {
		// The cross-type field (a or b) is a leaf when it has `{rt$label: '', rt$errors: {type: ''}}`
		// and is NOT a const reference.
		if strings.Contains(named.Friendly, "a: {rt$label: '', rt$errors: {type: ''}}") || strings.Contains(named.Friendly, "b: {rt$label: '', rt$errors: {type: ''}}") {
			leafEdges++
		}
	}
	if refEdges == 0 {
		t.Errorf("expected at least one forward const reference; got A:\n%s\nB:\n%s", a.Friendly, b.Friendly)
	}
	if leafEdges == 0 {
		t.Errorf("expected the back-edge to break to a leaf; got A:\n%s\nB:\n%s", a.Friendly, b.Friendly)
	}

	// TDZ safety: every const reference must point at a var declared earlier in the
	// slice. Build the set of vars declared up to each index and check references.
	declared := map[string]bool{}
	for _, named := range closure {
		assertRefsDeclaredBefore(t, named.Friendly, declared)
		assertRefsDeclaredBefore(t, named.Mock, declared)
		declared[named.FriendlyVar] = true
		declared[named.MockVar] = true
	}
}

// assertRefsDeclaredBefore fails if body references a friendly*/mock* const that
// is not yet in declared (would be a TDZ at runtime).
func assertRefsDeclaredBefore(t *testing.T, body string, declared map[string]bool) {
	t.Helper()
	for _, token := range strings.FieldsFunc(body, func(r rune) bool {
		return !(r == '$' || r == '_' || (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9'))
	}) {
		if (strings.HasPrefix(token, "friendly") || strings.HasPrefix(token, "mock")) &&
			token != "friendly" && token != "mock" && !declared[token] {
			// Only flag identifiers that look like our const vars (CamelCase suffix).
			suffix := strings.TrimPrefix(strings.TrimPrefix(token, "friendly"), "mock")
			if suffix != "" && suffix[0] >= 'A' && suffix[0] <= 'Z' {
				t.Errorf("TDZ: body references %q before it is declared; body:\n%s", token, body)
			}
		}
	}
}

// TestEmitClosure_SelfRecursive: `next: Node | null` yields ONE const; `next` is a
// broken leaf, not a self-reference.
func TestEmitClosure_SelfRecursive(t *testing.T) {
	closure := emitClosure(t, "node.ts", "Node", map[string]string{
		"node.ts": "export interface Node { value: string; next: Node | null }\n",
	})
	if len(closure) != 1 {
		t.Fatalf("want 1 const (Node), got %d: %+v", len(closure), closure)
	}
	node := closure[0]
	if node.TypeName != "Node" {
		t.Fatalf("want Node const; got %q", node.TypeName)
	}
	// `next` must be a leaf, never a self-reference (no `friendlyNode` inside).
	if strings.Contains(node.Friendly, "friendlyNode") {
		t.Errorf("Node must not self-reference (would TDZ); got:\n%s", node.Friendly)
	}
	if strings.Contains(node.Mock, "mockNode") {
		t.Errorf("Node must not self-reference in mock; got:\n%s", node.Mock)
	}
	if !strings.Contains(node.Friendly, "next:") {
		t.Errorf("Node friendly should still list 'next'; got:\n%s", node.Friendly)
	}
}

// TestEmitClosure_BackwardCompat: a named type with only inline/anonymous fields
// yields exactly one const whose body equals FriendlySkeleton/MockSkeleton's
// (the degenerate single-const case).
func TestEmitClosure_BackwardCompat(t *testing.T) {
	sources := map[string]string{
		"user.ts": "export interface User { name: string; tags: string[]; profile: { email: string } }\n",
	}
	closure := emitClosure(t, "user.ts", "User", sources)
	if len(closure) != 1 {
		t.Fatalf("want 1 const (anonymous fields only), got %d: %+v", len(closure), closure)
	}
	got := closure[0]

	// The inlined single-const path renders the same body.
	inlined := resolveFixture(t, "user.ts", "User", sources)
	wantFriendly := enrichment.FriendlySkeleton(inlined.Node, inlined.Resolve)
	wantMock := enrichment.MockSkeleton(inlined.Node, inlined.Resolve)
	if got.Friendly != wantFriendly {
		t.Errorf("friendly body diverged from FriendlySkeleton's:\n got:\n%s\nwant:\n%s", got.Friendly, wantFriendly)
	}
	if got.Mock != wantMock {
		t.Errorf("mock body diverged from MockSkeleton's:\n got:\n%s\nwant:\n%s", got.Mock, wantMock)
	}
	// The anonymous `profile` shape stays inlined (its email field is present).
	if !strings.Contains(got.Friendly, "email:") {
		t.Errorf("anonymous profile should be inlined; got:\n%s", got.Friendly)
	}
}
