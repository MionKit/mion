package resolver_test

import (
	"testing"

	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// demand_scope_test.go pins the demand-driven invariant for the function
// families: a family has an entry module for a type ONLY when a createX call
// site of that family references it. `te` (validationErrors) is one leaf — a
// type reached only through getRunTypeId (reflection) or through
// createValidateFn leaves no verr entry.
//
// `it` (validate) is demand-scoped too. Because the JSON/binary union decoders
// + validationErrors discriminate members via `val_<member>` cross-family
// edges, those edges ride each entry's module deps and the resolver's
// cross-family fixpoint renders the referenced val_ entries. So a
// reflection-only file emits ZERO val_ entries, a createValidateFn file emits
// them, and a file that ONLY serializes a (non-merging) union still gets the
// per-member val_ entries its decoder needs.

func scopeScan(t *testing.T, code string) protocol.Response {
	t.Helper()
	r := setupInline(t, map[string]string{"a.ts": code})
	resp := r.Dispatch(protocol.Request{
		Op:                  protocol.OpScanFiles,
		Files:               []string{"a.ts"},
		IncludeRunTypes:     true,
		IncludeEntryModules: true,
	})
	if resp.Error != "" {
		t.Fatalf("scanFiles: %s", resp.Error)
	}
	return resp
}

// TestDemandScope_ValidationErrorsScopedToItsCallSites — verr entries are emitted only
// for createGetValidationErrorsFn call sites, not for getRunTypeId or createValidateFn.
func TestDemandScope_ValidationErrorsScopedToItsCallSites(t *testing.T) {
	// Reflection only: no verr.
	reflect := scopeScan(t, `import {getRunTypeId} from '@ts-runtypes/core';
export const _ = getRunTypeId<{a: string; b: number}>();
`)
	if len(reflect.RunTypes) == 0 {
		t.Fatalf("reflection must still project runtypes for getRunTypeId, got none")
	}
	if hasFamilyEntry(reflect, "validationErrors") {
		t.Errorf("validationErrors entries must be absent for a reflection-only file, got %v", familyEntryKeys(reflect, "validationErrors"))
	}

	// createValidateFn demands `it`, not `te` — so still no verr.
	validate := scopeScan(t, `import {createValidateFn} from '@ts-runtypes/core';
export const _ = createValidateFn<{a: string}>();
`)
	if hasFamilyEntry(validate, "validationErrors") {
		t.Errorf("createValidateFn must NOT emit a verr entry, got %v", familyEntryKeys(validate, "validationErrors"))
	}

	// createGetValidationErrorsFn demands `te`.
	validationErrors := scopeScan(t, `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
export const _ = createGetValidationErrorsFn<{a: string}>();
`)
	if !hasFamilyEntry(validationErrors, "validationErrors") {
		t.Errorf("createGetValidationErrorsFn must emit a verr entry, got none")
	}
}

// TestDemandScope_ValidationErrorsTransitiveChildren — createGetValidationErrorsFn on a parent
// emits verr entries for the parent AND its non-inlined children (so dependency
// calls resolve), even though only the parent has a call site.
func TestDemandScope_ValidationErrorsTransitiveChildren(t *testing.T) {
	resp := scopeScan(t, `import {createGetValidationErrorsFn} from '@ts-runtypes/core';
interface Child { c: string }
interface Parent { child: Child[] }
export const _ = createGetValidationErrorsFn<Parent>();
`)
	count := len(familyEntryKeys(resp, "validationErrors"))
	if count < 2 {
		t.Errorf("expected the parent + transitive child verr entries (>=2), got %d: %v", count, familyEntryKeys(resp, "validationErrors"))
	}
}

// TestDemandScope_ItScopedReflectionOnly — `it` is demand-scoped: a
// getRunTypeId-only (reflection) file emits ZERO val_ entries (no createValidateFn
// site, no other family referencing val_ cross-family).
func TestDemandScope_ItScopedReflectionOnly(t *testing.T) {
	resp := scopeScan(t, `import {getRunTypeId} from '@ts-runtypes/core';
export const _ = getRunTypeId<{a: string; b: number}>();
`)
	if len(resp.RunTypes) == 0 {
		t.Fatalf("reflection must still project runtypes for getRunTypeId, got none")
	}
	if hasFamilyEntry(resp, "validate") {
		t.Errorf("it is demand-scoped; a reflection-only file must emit no val entries, got %v", familyEntryKeys(resp, "validate"))
	}
}

// TestDemandScope_ItScopedToCreateValidate — a createValidateFn call site demands the
// `it` family, so its val entry is emitted.
func TestDemandScope_ItScopedToCreateValidate(t *testing.T) {
	resp := scopeScan(t, `import {createValidateFn} from '@ts-runtypes/core';
export const _ = createValidateFn<{a: string}>();
`)
	if !hasFamilyEntry(resp, "validate") {
		t.Errorf("createValidateFn must emit a val entry, got none")
	}
}

// TestDemandScope_ItSeededByCrossFamilyUnion — the cross-family proof: a
// file that ONLY serializes a NON-merging union (conflicting shared prop, so
// the binary union decoder discriminates members via the per-member validate
// validators) and NEVER calls createValidateFn MUST still emit val_ entries — the
// union members — because the toBinary entry's cross-family module deps name
// them and the resolver's fixpoint renders them. Without that the union
// round-trip silently corrupts (missing val_<member> ⇒ `?? true` ⇒ first
// member always matches).
func TestDemandScope_ItSeededByCrossFamilyUnion(t *testing.T) {
	resp := scopeScan(t, `import {createBinaryEncoderFn} from '@ts-runtypes/core';
export const _ = createBinaryEncoderFn<{a: {n: number}} | {a: {s: string}}>();
`)
	// Sanity: the binary family IS demanded by createBinaryEncoderFn.
	if !hasFamilyEntry(resp, "toBinary") {
		t.Fatalf("createBinaryEncoderFn must emit tb entries, got none")
	}
	// The proof: no createValidateFn site, yet the union's per-member val entries
	// are rendered from the toBinary entry's cross-family edges.
	if !hasFamilyEntry(resp, "validate") {
		t.Fatalf("cross-family fixpoint broken: a createBinaryEncoderFn-only union file must still emit val member entries, got keys: %v", familyEntryKeys(resp, "toBinary"))
	}
}
