package purefunctions

import (
	"fmt"
	"math/rand"
	"os"
	"regexp"
	"strconv"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/constants"

	"github.com/microsoft/typescript-go/shim/ast"
	"github.com/microsoft/typescript-go/shim/core"
	"github.com/microsoft/typescript-go/shim/parser"
	"github.com/microsoft/typescript-go/shim/tspath"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/entrymodules"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Two seeded sweeps over the id rule, both with a cheap oracle.
//
// An id is the key everywhere — the string the transform injects, the name the
// emitted module registers under, and the module a dependent body imports — so
// two pure functions landing on one id, or one id landing on two modules,
// breaks delivery rather than a test. Replay a reported seed with
// MION_FUZZ_SEED.

// fuzzSeed is entrySeed for this package: the shared policy, wired to testing.T.
func fuzzSeed(t *testing.T, lane string) int64 {
	t.Helper()
	seed, origin, err := testfixtures.FuzzSeed(lane)
	if err != nil {
		t.Fatal(err)
	}
	t.Log(origin)
	return seed
}

func fuzzIterations(t *testing.T, fallback int) int {
	t.Helper()
	raw := os.Getenv("MION_FUZZ_ITER")
	if raw == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(raw)
	if err != nil {
		t.Fatalf("MION_FUZZ_ITER: %v", err)
	}
	return parsed
}

// The bytes an id can hold: a package name, a path and a bound name are all
// author-chosen, so the sweep draws from what a real project spells them with
// plus the punctuation that has to survive the module encoding.
var idSegmentBytes = []rune("abcXYZ019_-.@$~+ ()[]{}'\"\\/#%&åß漢")

func randomSegment(rng *rand.Rand, maxLen int) string {
	var builder strings.Builder
	for i := 0; i < 1+rng.Intn(maxLen); i++ {
		builder.WriteRune(idSegmentBytes[rng.Intn(len(idSegmentBytes))])
	}
	return builder.String()
}

// randomID composes an id the way IDFor does: the package that owns the pure
// fn (scoped or plain, and sometimes absent for a file under no named package),
// then the hash of the body that ships.
func randomID(rng *rand.Rand) string {
	var owner string
	switch rng.Intn(3) {
	case 0:
		owner = "@" + randomSegment(rng, 6) + "/" + randomSegment(rng, 6)
	case 1:
		owner = randomSegment(rng, 8)
	default:
		owner = "" // an overlay or a scratch project keeps the hash alone
	}
	return owner + constants.PureFnHashPrefix + CodeHash(randomSegment(rng, 20))
}

var jsIdentifierRE = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)

// TestFuzz_IDModuleNameInjectivity — distinct ids must give distinct module
// names that still name their id, and every import binding must be a JS
// identifier. A collision here would have two pure functions share one module.
func TestFuzz_IDModuleNameInjectivity(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	rng := rand.New(rand.NewSource(fuzzSeed(t, "purefn-id")))
	iterations := fuzzIterations(t, 4000)
	moduleOwner := map[string]string{}
	for iteration := 0; iteration < iterations; iteration++ {
		id := randomID(rng)

		location, name, ok := SplitID(id)
		if !ok {
			t.Fatalf("SplitID(%q) found no separator", id)
		}
		if location+constants.PureFnHashPrefix+name != id {
			t.Fatalf("SplitID(%q) does not round-trip: (%q, %q)", id, location, name)
		}

		module := entrymodules.ModuleName(id, entrymodules.KindPureFn)
		if again := entrymodules.ModuleName(id, entrymodules.KindPureFn); again != module {
			t.Fatalf("ModuleName(%q) is not deterministic: %q then %q", id, module, again)
		}
		if owner, seen := moduleOwner[module]; seen && owner != id {
			t.Fatalf("two ids share one module %q:\n  %q\n  %q", module, owner, id)
		}
		moduleOwner[module] = id

		binding := entrymodules.BindingName(module)
		if !jsIdentifierRE.MatchString(binding) {
			t.Fatalf("BindingName(%q) = %q, which is not a JS identifier (id %q)", module, binding, id)
		}
		if bindingOf := entrymodules.BindingName(module); bindingOf != binding {
			t.Fatalf("BindingName(%q) is not deterministic", module)
		}
	}
	t.Logf("purefn-id sweep: %d ids, %d distinct modules", iterations, len(moduleOwner))
}

// noiseFor returns text that MENTIONS a dependency's binding without
// referencing it: inside a string, inside a comment, and as a property name.
// None of it may be lowered, and none of it may count as a leftover reference.
func noiseFor(binding string, index int) string {
	return fmt.Sprintf("  const noise%d = {%s: '%s'}; // %s stays a word here\n", index, binding, binding, binding)
}

// TestFuzz_LoweringRoundTrip — a body reaching N imported ids must ship N
// quoted ids and no reference to the bindings it was written with, and must
// still parse as JavaScript. That is the whole contract of lowering: the
// emitted body closes over nothing, so it runs wherever it is delivered.
func TestFuzz_LoweringRoundTrip(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	rng := rand.New(rand.NewSource(fuzzSeed(t, "purefn-lowering")))
	iterations := fuzzIterations(t, 6)
	for iteration := 0; iteration < iterations; iteration++ {
		depCount := 1 + rng.Intn(4)
		var deps, imports, body strings.Builder
		deps.WriteString("import {registerPureFn} from '@mionjs/run-types';\n")
		for i := 0; i < depCount; i++ {
			fmt.Fprintf(&deps, "export const dep%d = registerPureFn((value: string): string => value + '%d');\n", i, i)
		}
		lookups := 0
		for i := 0; i < depCount; i++ {
			binding := fmt.Sprintf("dep%d", i)
			fmt.Fprintf(&imports, "import {%s} from './deps';\n", binding)
			// Every dep is reached at least once, some of them twice: a
			// repeated lookup is one recorded dependency but two lowerings.
			uses := 1 + rng.Intn(2)
			for use := 0; use < uses; use++ {
				fmt.Fprintf(&body, "  const use%d_%d = utl.getPureFn(%s);\n", i, use, binding)
				lookups++
			}
			body.WriteString(noiseFor(binding, i))
		}
		source := "import {registerPureFnFactory} from '@mionjs/run-types';\n" + imports.String() +
			"export const consumer = registerPureFnFactory(function (utl) {\n" + body.String() +
			"  return function _f(value: string): string { return value; };\n});\n"
		t.Logf("iteration %d source:\n%s", iteration, source)

		entries, _ := extractFromOverlay(t, map[string]string{"deps.ts": deps.String(), "a.ts": source})
		var consumer *Entry
		for index := range entries {
			if entries[index].BindingName == "consumer" {
				consumer = &entries[index]
			}
		}
		if consumer == nil {
			t.Fatalf("no consumer entry extracted; entries=%+v", entries)
		}

		if err := parsesAsJS(consumer.ParamNames, consumer.Code); err != nil {
			t.Fatalf("emitted body is not valid JavaScript: %v\ncode:\n%s", err, consumer.Code)
		}
		// Each dependency's id is read back off its own entry: a hash cannot be
		// predicted, and the point is that the dependent lowered the very id the
		// declaring registration was given.
		depIDs := make([]string, depCount)
		for i := 0; i < depCount; i++ {
			depIDs[i] = entryNamed(t, entries, fmt.Sprintf("dep%d", i)).ID
		}
		for i := 0; i < depCount; i++ {
			for j := i + 1; j < depCount; j++ {
				if depIDs[i] == depIDs[j] {
					t.Fatalf("dep%d and dep%d share one id %q", i, j, depIDs[i])
				}
			}
		}
		for i := 0; i < depCount; i++ {
			quoted := "'" + depIDs[i] + "'"
			if got := strings.Count(consumer.Code, quoted); got == 0 {
				t.Fatalf("dep%d was never lowered into the body:\n%s", i, consumer.Code)
			}
			if references := identifierReferences(t, consumer.ParamNames, consumer.Code, fmt.Sprintf("dep%d", i)); references != 0 {
				t.Fatalf("dep%d is still referenced %d time(s) in the emitted body:\n%s", i, references, consumer.Code)
			}
		}
		// One quoted id per lookup, and nothing else quoted into the body.
		quotedTotal := 0
		for i := 0; i < depCount; i++ {
			quotedTotal += strings.Count(consumer.Code, "'"+depIDs[i]+"'")
		}
		if quotedTotal != lookups {
			t.Fatalf("expected %d quoted ids (one per lookup), found %d:\n%s", lookups, quotedTotal, consumer.Code)
		}
		if len(consumer.PureFnDependencies) != depCount {
			t.Fatalf("expected %d recorded dependencies, got %v", depCount, consumer.PureFnDependencies)
		}
	}
}

// renderedBody wraps an emitted body the way rtUtils' buildFactoryFromCode
// does at runtime (`new Function(...paramNames, "'use strict'; " + code)`), so
// what the checks below parse is exactly what a consumer evaluates.
func renderedBody(paramNames []string, code string) string {
	return "(function (" + strings.Join(paramNames, ", ") + ") {\n'use strict';\n" + code + "\n})"
}

// parsesAsJS re-parses an emitted body as JAVASCRIPT: leftover type syntax is a
// grammar error there, which is what makes this a real check rather than a
// second opinion from the same stripper.
func parsesAsJS(paramNames []string, code string) error {
	checkPath := tspath.NormalizePath("/purefn-check.js")
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: checkPath, Path: tspath.Path(checkPath)},
		renderedBody(paramNames, code),
		core.ScriptKindJS,
	)
	if sourceFile == nil {
		return fmt.Errorf("parser returned no source file")
	}
	var messages []string
	for _, diag := range sourceFile.Diagnostics() {
		messages = append(messages, fmt.Sprintf("TS%d %s", diag.Code(), diag.MessageKey()))
	}
	if len(messages) > 0 {
		return fmt.Errorf("%s", strings.Join(messages, "; "))
	}
	return nil
}

// identifierReferences counts the times `name` is READ as a value in an emitted
// body. A property name or a member being accessed is not a read, which is what
// lets the sweep use those shapes as noise; a string or a comment is not even an
// identifier, so it never reaches here.
func identifierReferences(t *testing.T, paramNames []string, code, name string) int {
	t.Helper()
	checkPath := tspath.NormalizePath("/purefn-check.js")
	sourceFile := parser.ParseSourceFile(
		ast.SourceFileParseOptions{FileName: checkPath, Path: tspath.Path(checkPath)},
		renderedBody(paramNames, code),
		core.ScriptKindJS,
	)
	if sourceFile == nil {
		t.Fatalf("parser returned no source file for the emitted body")
	}
	count := 0
	var walk func(node *ast.Node)
	walk = func(node *ast.Node) {
		if node == nil {
			return
		}
		switch node.Kind {
		case ast.KindIdentifier:
			if node.Text() == name {
				count++
			}
			return
		case ast.KindPropertyAssignment:
			// `{dep0: …}` — the key is a name, not a read of the binding.
			walk(node.AsPropertyAssignment().Initializer)
			return
		case ast.KindPropertyAccessExpression:
			// `x.dep0` — only the object side is a read.
			walk(node.AsPropertyAccessExpression().Expression)
			return
		}
		node.ForEachChild(func(child *ast.Node) bool {
			walk(child)
			return false
		})
	}
	walk(sourceFile.AsNode())
	return count
}
