package structural

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// stubCtx is a minimal formats.EmitContext for direct emitter tests: it records
// the prologue items the emitter hoists so the tests can assert on them, and
// hands out collision-free local names the way the walker does.
type stubCtx struct {
	items    map[string]string
	order    []string
	counters map[string]int
	pureFns  []string
}

func newStubCtx() *stubCtx {
	return &stubCtx{items: map[string]string{}, counters: map[string]int{}}
}

func (c *stubCtx) AddPureFnDependency(_, _, _ string) {}

func (c *stubCtx) UsePureFn(namespace, fnName, _ string) string {
	c.pureFns = append(c.pureFns, namespace+"::"+fnName)
	return fnName
}

func (c *stubCtx) HasContextItem(key string) bool {
	_, ok := c.items[key]
	return ok
}

func (c *stubCtx) SetContextItem(key, value string) {
	if _, seen := c.items[key]; !seen {
		c.order = append(c.order, key)
	}
	c.items[key] = value
}

func (c *stubCtx) EmitDiagnostic(_ string, _ ...string) {}
func (c *stubCtx) JSEngine() jsengine.Engine            { return nil }
func (c *stubCtx) PatternSampleCount() int              { return 0 }
func (c *stubCtx) PatternGenFailure(_, _ string) string { return "" }

func (c *stubCtx) NextLocalVar(prefix string) string {
	name := prefix + strconv.Itoa(c.counters[prefix])
	c.counters[prefix]++
	return name
}

// prologue joins every hoisted declaration in insertion order.
func (c *stubCtx) prologue() string {
	parts := make([]string, 0, len(c.order))
	for _, key := range c.order {
		parts = append(parts, c.items[key])
	}
	return strings.Join(parts, ";")
}

func objAnnotation(params map[string]any) *protocol.FormatAnnotation {
	return &protocol.FormatAnnotation{Name: formattedObjectName, Params: params}
}

func keyList(keys ...string) []any {
	out := make([]any, len(keys))
	for i, key := range keys {
		out[i] = key
	}
	return out
}

// TestFormattedObject_ClosedWalkIsAllocationFree pins the whole point of the
// emitted shape: ONE hoisted `for…in` sweep with early returns, and none of
// the per-key allocations the previous `Object.keys(v).every(cb)` form paid
// (a key array, a callback, and a fresh `[…]` literal per key).
func TestFormattedObject_ClosedWalkIsAllocationFree(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	got := emitter.EmitValidateCheck(objAnnotation(map[string]any{"closed": keyList("id", "name")}), "v", ctx)

	if got != "okObj0(v)" {
		t.Fatalf("check = %q, want a call to the hoisted walk fn", got)
	}
	prologue := ctx.prologue()
	for _, banned := range []string{"Object.keys", ".every(", ".includes(", "new RegExp"} {
		if strings.Contains(prologue, banned) {
			t.Errorf("prologue must not contain %q; got %q", banned, prologue)
		}
	}
	if !strings.Contains(prologue, "for (const k in o)") {
		t.Errorf("prologue must sweep with for…in; got %q", prologue)
	}
	if !strings.Contains(prologue, "k === 'id' || k === 'name'") {
		t.Errorf("small key lists use an identity chain; got %q", prologue)
	}
}

// TestFormattedObject_ClosedPatternsHoistTheRegex is the regression this change
// exists for: the pattern regex used to be constructed INSIDE the per-key
// callback, so it recompiled once per key per call.
func TestFormattedObject_ClosedPatternsHoistTheRegex(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	params := map[string]any{"closed": keyList("id"), "closedPatterns": keyList("^col_")}
	emitter.EmitValidateCheck(objAnnotation(params), "v", ctx)

	prologue := ctx.prologue()
	if !strings.Contains(prologue, `const reObj0 = new RegExp("^col_")`) {
		t.Fatalf("pattern regex must hoist into the prologue; got %q", prologue)
	}
	// Exactly one construction — inside the loop body there must be only a
	// reference to the hoisted var.
	if count := strings.Count(prologue, "new RegExp"); count != 1 {
		t.Errorf("regex constructed %d times, want exactly 1: %q", count, prologue)
	}
	walk := ctx.items["okObj0"]
	if !strings.Contains(walk, "reObj0.test(k)") {
		t.Errorf("walk must reference the hoisted regex; got %q", walk)
	}
}

// TestFormattedObject_LargeKeyListUsesHoistedSet — above the identity-chain
// threshold the allowed-key test switches to a prologue Set, matching the
// index-signature sibling-skip idiom (unknownkeys_shared.go).
func TestFormattedObject_LargeKeyListUsesHoistedSet(t *testing.T) {
	keys := make([]string, 0, identityChainMaxKeys+1)
	for i := 0; i <= identityChainMaxKeys; i++ {
		keys = append(keys, "k"+strconv.Itoa(i))
	}
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	emitter.EmitValidateCheck(objAnnotation(map[string]any{"closed": keyList(keys...)}), "v", ctx)

	prologue := ctx.prologue()
	if !strings.Contains(prologue, "new Set(") {
		t.Fatalf("above the threshold the key list must hoist as a Set; got %q", prologue)
	}
	if !strings.Contains(ctx.items["okObj0"], "ksObj0.has(k)") {
		t.Errorf("walk must probe the hoisted Set; got %q", ctx.items["okObj0"])
	}
}

// TestFormattedObject_BoundsShareTheClosedWalk — minProperties / maxProperties /
// closed used to emit one independent `Object.keys(v)` allocation EACH. They
// now ride the same single sweep.
func TestFormattedObject_BoundsShareTheClosedWalk(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	params := map[string]any{"minProperties": 1.0, "maxProperties": 3.0, "closed": keyList("a")}
	emitter.EmitValidateCheck(objAnnotation(params), "v", ctx)

	walk := ctx.items["okObj0"]
	if count := strings.Count(walk, "for (const k in"); count != 1 {
		t.Fatalf("expected exactly one sweep, got %d: %q", count, walk)
	}
	if !strings.Contains(walk, "n >= 1 && n <= 3") {
		t.Errorf("both bounds must resolve from the counted sweep; got %q", walk)
	}
	if strings.Contains(walk, "Object.keys") {
		t.Errorf("counting must not allocate a key array; got %q", walk)
	}
}

// TestFormattedObject_NoAllowedKeysRejectsEveryKey — a bare
// `additionalProperties: false` with no `properties` admits only `{}`.
func TestFormattedObject_NoAllowedKeysRejectsEveryKey(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	emitter.EmitValidateCheck(objAnnotation(map[string]any{"closed": []any{}}), "v", ctx)

	if !strings.Contains(ctx.items["okObj0"], "if (!(false)) return false") {
		t.Errorf("every key must be additional; got %q", ctx.items["okObj0"])
	}
}

// TestFormattedObject_ErrorsLaneAttributesEachKeyword — the errors lane keeps one
// statement per keyword so each failure reports under its own name, and shares
// a single hoisted count fn between the two bounds.
func TestFormattedObject_ErrorsLaneAttributesEachKeyword(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	params := map[string]any{"minProperties": 1.0, "maxProperties": 3.0, "closed": keyList("a")}
	got := emitter.EmitValidationErrorsCheck(objAnnotation(params), "v", "pth", "er", ctx)

	for _, keyword := range []string{"minProperties", "maxProperties", "closed"} {
		if !strings.Contains(got, "'"+keyword+"'") {
			t.Errorf("errors lane must report %q; got %q", keyword, got)
		}
	}
	if count := strings.Count(ctx.prologue(), "function(o){let n = 0"); count != 1 {
		t.Errorf("both bounds must share ONE hoisted count fn; prologue = %q", ctx.prologue())
	}
	if strings.Contains(got, "Object.keys") || strings.Contains(got, ".every(") {
		t.Errorf("errors lane must not allocate per key; got %q", got)
	}
}

// TestFormattedObject_NoContextStillEmits — direct emitter callers pass no
// context; the same sweep runs as an IIFE rather than panicking.
func TestFormattedObject_NoContextStillEmits(t *testing.T) {
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	got := emitter.EmitValidateCheck(objAnnotation(map[string]any{"closed": keyList("a")}), "v", nil)
	if !strings.Contains(got, "for (const k in o)") || !strings.HasSuffix(got, "(v)") {
		t.Errorf("context-free emit must still produce the sweep; got %q", got)
	}
}

// TestFormattedObject_EmptyAnnotationEmitsNothing keeps the no-keyword case free
// of a pointless prologue entry.
func TestFormattedObject_EmptyAnnotationEmitsNothing(t *testing.T) {
	ctx := newStubCtx()
	emitter := formattedObjectEmitter{kind: protocol.KindObjectLiteral}
	if got := emitter.EmitValidateCheck(objAnnotation(map[string]any{}), "v", ctx); got != "" {
		t.Errorf("no keywords should emit no check; got %q", got)
	}
	if len(ctx.order) != 0 {
		t.Errorf("no keywords should hoist nothing; got %v", ctx.order)
	}
}
