package resolver_test

import (
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/reflection"
)

// Cycle back-edge DEPTH tests — the shared-recursive-container convergence
// class the json-schema translation fuzz lane surfaced (two bisimilar
// recursive containers used to resolve different ids).
//
// A cycle token `$<kind>_<relDepth>` is relative to the CYCLE TARGET in the
// canonical quotient emission (typeid/canonicalize.go), so bisimilar types
// spell their loops identically regardless of which node a raw walk entered
// through or how the checker interned container nodes. These tests pin the
// depth semantics from the type-first side alone: the authoring-form
// convergence itself is pinned by the JS define suite and the fuzz lane's
// id-equality oracle.

func kindDigits(kind reflection.ReflectionKind) string { return strconv.Itoa(int(kind)) }

// cycleToken renders a back-edge token for a target of `kind` at relative
// depth `relDepth`, plus the delimiter that must follow it (tokens are bare,
// so the caller anchors the depth digit with the composition byte that comes
// next — `,` before a sibling, `}` at the end of a member group).
func cycleToken(kind reflection.ReflectionKind, relDepth int, delimiter string) string {
	return "$" + kindDigits(kind) + "_" + strconv.Itoa(relDepth) + delimiter
}

// TestCycleDepthID_SharedVsDuplicatedContainer — the motivating class, static
// and reflect shapes in one fixture (the marker coverage rule's paired forms).
// `Dup` spells the container as two anonymous literals (two checker types);
// `Shared` routes both properties through one named alias (one checker type).
// The types are bisimilar, so all four sites must land on ONE structural id.
// Before the lowlink gate this failed asymmetrically: the interned side reused
// a depth-baked token where the live depth differed.
func TestCycleDepthID_SharedVsDuplicatedContainer(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type Dup = {p1?: {v: Dup}; p2: {v: Dup}};
type WShared = {v: Shared};
type Shared = {p1?: WShared; p2: WShared};
getRunTypeId<Dup>();
getRunTypeId<Shared>();
const dupValue = {} as Dup;
const sharedValue = {} as Shared;
getRunTypeId(dupValue);
getRunTypeId(sharedValue);
`})
	ids := scanSiteIDs(t, r)
	if len(ids) != 4 {
		t.Fatalf("expected 4 call sites (Dup/Shared × static/reflect), got %d", len(ids))
	}
	for i, id := range ids[1:] {
		if id != ids[0] {
			t.Fatalf("bisimilar shared/duplicated recursive containers must converge: site %d got %q, want %q\n  structural[0]: %q\n  structural[%d]: %q",
				i+1, id, ids[0], structuralByID(t, r, ids[0]), i+1, structuralByID(t, r, id))
		}
	}
}

// TestCycleDepthID_NestedReuse_DepthsStayLive — one pointer legitimately at two
// depths. `Rec.x` reaches Box directly (back-edge 2 frames below Rec) while
// `Rec.y` reaches the SAME Box through an array (3 frames), so the structural
// string must carry BOTH depths. Before the gate, the second occurrence spliced
// the first one's memoised `_2` token at depth 3. Both members are required, so
// this isolates the cache gate from the optional-member walk fix.
func TestCycleDepthID_NestedReuse_DepthsStayLive(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type Box = {b: Rec};
type Rec = {x: Box; y: Box[]};
getRunTypeId<Rec>();
`})
	ids := scanSiteIDs(t, r)
	structural := structuralByID(t, r, ids[0])
	// Canonical emission of Rec: 30{32:x:30{32:b:$30_2},32:y:25:0:30{32:b:$30_3}}
	// — the direct Box occurrence closes 2 frames below Rec, the array-wrapped
	// one 3 frames below; both tokens end the `b` member so `}` anchors them.
	direct := cycleToken(reflection.KindObjectLiteral, 2, "}")
	throughArray := cycleToken(reflection.KindObjectLiteral, 3, "}")
	if !strings.Contains(structural, direct) {
		t.Fatalf("direct container occurrence must close at relative depth 2 (%q): %q", direct, structural)
	}
	if !strings.Contains(structural, throughArray) {
		t.Fatalf("array-wrapped occurrence of the same container must close at relative depth 3 (%q), not splice a memoised depth: %q", throughArray, structural)
	}
}

// TestCycleDepthID_MotivatingShape_SameDepthBothMembers — the exact shape the
// fuzz lane caught: `{p1?: N1[]; kids2: N1[]}`. Both members wrap the SAME
// recursive ref in the same container at the same nesting, so both member
// tokens must carry relative depth 2 and no depth-3 token may appear anywhere
// (the fixture's genuine nesting never exceeds 2, including inside the
// structural anchor). Before the fix the optional member's discarded
// `T | undefined` pre-walk baked a `_3` token into the cache and the required
// member spliced it back in.
func TestCycleDepthID_MotivatingShape_SameDepthBothMembers(t *testing.T) {
	r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
type N1 = {p1?: N1[]; kids2: N1[]};
getRunTypeId<N1>();
`})
	ids := scanSiteIDs(t, r)
	structural := structuralByID(t, r, ids[0])
	// Canonical emission: 30{32:kids2:25:0:$30_2,32:p1?:25:0:$30_2} — members
	// sort by name, so kids2's token is followed by `,` and p1's by `}`.
	arrayOfBackRef := kindDigits(reflection.KindArray) + ":0:"
	for member, delimiter := range map[string]string{"kids2:": ",", "p1?:": "}"} {
		want := member + arrayOfBackRef + cycleToken(reflection.KindObjectLiteral, 2, delimiter)
		if !strings.Contains(structural, want) {
			t.Fatalf("member %q must wrap a depth-2 back-edge (%q): %q", member, want, structural)
		}
	}
	if stale := regexp.MustCompile(`\$\d+_3(\D|$)`); stale.MatchString(structural) {
		t.Fatalf("no depth-3 token belongs in this shape (max genuine nesting is 2): %q", structural)
	}
}

// TestCycleDepthID_ConvergingClassesKeepConverging — the probed class-boundary
// rows that already converged before the fix must keep converging after it.
// Each row declares a type and a structurally-identical clone (two root
// checker types) with paired static sites; the clone forces root-level
// identity independence per class.
func TestCycleDepthID_ConvergingClassesKeepConverging(t *testing.T) {
	rows := []struct {
		name   string
		source string
	}{
		{"direct refs, any count", `type A = {a?: A; b: A; c: A};
type B = {a?: B; b: B; c: B};`},
		{"single required container", `type A = {k: A[]};
type B = {k: B[]};`},
		{"mixed direct + container", `type A = {n?: A; k: A[]};
type B = {n?: B; k: B[]};`},
		{"duplicated non-recursive containers (acyclic control)", `type A = {a: {v: number}[]; b: {v: number}[]};
type El = {v: number};
type B = {a: El[]; b: El[]};`},
	}
	for _, row := range rows {
		t.Run(row.name, func(t *testing.T) {
			r := setupInline(t, map[string]string{"test.ts": `import {getRunTypeId} from '@mionjs/run-types';
` + row.source + `
getRunTypeId<A>();
getRunTypeId<B>();
`})
			ids := scanSiteIDs(t, r)
			if len(ids) != 2 {
				t.Fatalf("expected 2 call sites, got %d", len(ids))
			}
			if ids[0] != ids[1] {
				t.Fatalf("structurally identical twins must share one id:\n  A: %q → %q\n  B: %q → %q",
					ids[0], structuralByID(t, r, ids[0]), ids[1], structuralByID(t, r, ids[1]))
			}
		})
	}
}
