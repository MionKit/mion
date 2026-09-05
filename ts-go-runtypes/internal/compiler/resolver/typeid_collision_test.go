package resolver_test

import (
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/protocol"
)

// MKR014 — two different types landing on the same short type id.
//
// Type ids are exactly `hashLength` characters by contract. The dictionary used
// to answer a collision by re-hashing the loser at a longer length, so two
// colliding types silently got ids of different lengths and nobody was told.
// Now the build stops and names both shapes, the shared id, and the length to
// raise `hashLength` to.
//
// Forcing a real collision needs a small hash space, so these scans run at
// hashLength 1: the first character of an id is always a letter, which leaves
// 52 possible ids. A union of `collidingUnionMembers` string literals mints one
// id per member, so the pigeonhole principle makes the collision certain rather
// than lucky.

const collidingUnionMembers = 60

// collidingUnionType renders a union with more members than length-1 ids exist.
func collidingUnionType() string {
	members := make([]string, 0, collidingUnionMembers)
	for i := 0; i < collidingUnionMembers; i++ {
		members = append(members, "'v"+strconv.Itoa(i)+"'")
	}
	return "type Big = " + strings.Join(members, " | ") + ";"
}

// scanAtHashLength scans `files` with the resolver's hash length pinned, so a
// test can pick a length small enough to force a collision.
func scanAtHashLength(t *testing.T, hashLength int, files map[string]string) protocol.Response {
	t.Helper()
	session := setupInlineWith(t, files, func(programOpts *program.Options, resolverOpts *resolver.Options) {
		programOpts.SingleThreaded = true
		resolverOpts.SingleThreaded = true
		resolverOpts.HashLength = hashLength
	})
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sortStrings(names)
	response := session.Dispatch(protocol.Request{Op: protocol.OpScanFiles, Files: names})
	if response.Error != "" {
		t.Fatalf("scanFiles: %s", response.Error)
	}
	return response
}

// assertCollisionReported pins the whole contract of the diagnostic: it is an
// error, it names the shared id and both shapes, it says which length to try,
// it points at the site that took the id first, and the offending site is
// suppressed so no placeholder id can ship.
func assertCollisionReported(t *testing.T, response protocol.Response) {
	t.Helper()
	var found *diagnostics.Diagnostic
	for i := range response.Diagnostics {
		if response.Diagnostics[i].Code == diagnostics.CodeTypeIdCollision {
			found = &response.Diagnostics[i]
		}
	}
	if found == nil {
		codes := make([]string, 0, len(response.Diagnostics))
		for _, diag := range response.Diagnostics {
			codes = append(codes, diag.Code)
		}
		t.Fatalf("expected %s, got codes %v", diagnostics.CodeTypeIdCollision, codes)
	}
	if found.Severity != diagnostics.SeverityError {
		t.Fatalf("%s must be an error, got severity %v", found.Code, found.Severity)
	}
	if len(found.Args) != 5 {
		t.Fatalf("expected [id, first shape, second shape, next length, origin], got %q", found.Args)
	}
	sharedID, firstShape, secondShape, nextLength, origin := found.Args[0], found.Args[1], found.Args[2], found.Args[3], found.Args[4]
	if sharedID == "" {
		t.Fatal("the diagnostic must name the id the two types share")
	}
	if firstShape == "" || secondShape == "" || firstShape == secondShape {
		t.Fatalf("the diagnostic must name two DIFFERENT shapes, got %q and %q", firstShape, secondShape)
	}
	if nextLength != "2" {
		t.Fatalf("expected the next hashLength to try (2) at length 1, got %q", nextLength)
	}
	// The winner here is an inner union member, so it has no call site of its
	// own: the message says where it came from and carries no dangling Related.
	if origin == "" {
		t.Fatal("the diagnostic must say where the first shape came from")
	}
	for _, related := range found.Related {
		if related.FilePath == "" {
			t.Fatalf("a Related pointer must name a file, got %+v", related)
		}
	}
	if len(response.Sites) != 0 {
		t.Fatalf("a colliding site must emit no site, got %d", len(response.Sites))
	}
}

func TestTypeIdCollision_StaticForm(t *testing.T) {
	assertCollisionReported(t, scanAtHashLength(t, 1, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
` + collidingUnionType() + `
export const id = getRunTypeId<Big>();
`,
	}))
}

func TestTypeIdCollision_ReflectForm(t *testing.T) {
	assertCollisionReported(t, scanAtHashLength(t, 1, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
` + collidingUnionType() + `
const value: Big = 'v0';
export const id = getRunTypeId(value);
`,
	}))
}

// When the type that took the id first was itself asked for at a marker call,
// the diagnostic also carries a Related pointer at that call, so both ends are
// reachable from the build log. One distinct object type per file, all at
// hashLength 1, so every id in play belongs to a call site.
func TestTypeIdCollision_PointsAtTheSiteThatTookTheIdFirst(t *testing.T) {
	files := map[string]string{}
	for i := 0; i < collidingUnionMembers; i++ {
		name := strconv.Itoa(i)
		files["f"+name+".ts"] = `import {getRunTypeId} from '@mionjs/run-types';
type T` + name + ` = {p` + name + `: string};
export const id` + name + ` = getRunTypeId<T` + name + `>();
`
	}
	response := scanAtHashLength(t, 1, files)
	var related *diagnostics.Related
	for _, diag := range response.Diagnostics {
		if diag.Code == diagnostics.CodeTypeIdCollision && len(diag.Related) == 1 {
			related = &diag.Related[0]
			break
		}
	}
	if related == nil {
		t.Fatal("expected a collision whose winner is a marker call, with a Related pointing at it")
	}
	if _, scanned := files[related.FilePath]; !scanned {
		t.Fatalf("Related must point at one of the scanned files, got %q", related.FilePath)
	}
	if related.StartLine == 0 || related.StartCol == 0 {
		t.Fatalf("Related must carry a real position, got %+v", related.Site)
	}
	if !strings.Contains(related.Message, "first type to take the id") {
		t.Fatalf("Related message should say what the pointer is for, got %q", related.Message)
	}
}

// The same union at the DEFAULT hash length fits comfortably: no collision, and
// both marker forms resolve to one shared cache entry (the suite's hash
// equivalence pair, and the check that the new failure has no false positives).
func TestTypeIdCollision_FormEquivalenceAtDefaultLength(t *testing.T) {
	response := scanAtHashLength(t, 0, map[string]string{
		"a.ts": `import {getRunTypeId} from '@mionjs/run-types';
` + collidingUnionType() + `
export const staticForm = getRunTypeId<Big>();
const value: Big = 'v0';
export const reflectForm = getRunTypeId(value);
`,
	})
	for _, diag := range response.Diagnostics {
		if diag.Code == diagnostics.CodeTypeIdCollision {
			t.Fatalf("%s must not fire at the default hash length: %+v", diag.Code, diag)
		}
	}
	if len(response.Sites) != 2 {
		t.Fatalf("expected both marker forms to resolve, got %d sites", len(response.Sites))
	}
	if response.Sites[0].ID != response.Sites[1].ID {
		t.Fatalf("both forms must share one entry, got %q and %q", response.Sites[0].ID, response.Sites[1].ID)
	}
}
