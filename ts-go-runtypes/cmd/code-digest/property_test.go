package main

import (
	"go/scanner"
	"go/token"
	"math/rand"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"testing"

	"github.com/microsoft/typescript-go/shim/core"
	"github.com/mionkit/mion/ts-go-runtypes/internal/testfixtures"
)

// Paths whose code files the lanes hash raw anyway, and that may hold deliberately broken code.
var notTokenHashed = regexp.MustCompile(`(^|/)(third_party|_deps|node_modules)/|fixture|testdata|__snapshots__`)

func repoCodeFiles(t *testing.T) (string, []string) {
	t.Helper()
	root, err := filepath.Abs("../../..")
	if err != nil {
		t.Fatal(err)
	}
	listed, err := exec.Command("git", "-C", root, "ls-files", "*.ts", "*.mts", "*.cts", "*.js", "*.mjs", "*.cjs", "*.go").Output()
	if err != nil {
		t.Skipf("no git checkout: %v", err)
	}
	var files []string
	for _, file := range strings.Split(strings.TrimSpace(string(listed)), "\n") {
		if !notTokenHashed.MatchString(file) {
			files = append(files, file)
		}
	}
	return root, files
}

// tokenRanges lists every code token's [start, end); a comment can go before any start without touching a literal.
func tokenRanges(t *testing.T, filePath, text string) [][2]int {
	t.Helper()
	var ranges [][2]int
	if strings.HasSuffix(filePath, ".go") {
		fileSet := token.NewFileSet()
		file := fileSet.AddFile("", fileSet.Base(), len(text))
		var goScanner scanner.Scanner
		goScanner.Init(file, []byte(text), nil, 0)
		for {
			pos, tok, lit := goScanner.Scan()
			if tok == token.EOF {
				break
			}
			if tok == token.SEMICOLON && lit == "\n" {
				continue
			}
			width := len(lit)
			if width == 0 {
				width = len(tok.String())
			}
			ranges = append(ranges, [2]int{file.Offset(pos), file.Offset(pos) + width})
		}
		return ranges
	}
	kind := core.ScriptKindTS
	if !strings.HasSuffix(filePath, "ts") {
		kind = core.ScriptKindJS
	}
	var out strings.Builder
	if err := tsWalk(filePath, text, kind, &out, func(start, end int) { ranges = append(ranges, [2]int{start, end}) }); err != nil {
		t.Fatalf("%s: %v", filePath, err)
	}
	return ranges
}

func insideCode(ranges [][2]int, offset int) bool {
	at := sort.Search(len(ranges), func(i int) bool { return ranges[i][1] > offset })
	return at < len(ranges) && ranges[at][0] <= offset
}

func atLineStart(text string, offset int) bool {
	lineStart := strings.LastIndexByte(text[:offset], '\n') + 1
	return strings.TrimSpace(text[lineStart:offset]) == ""
}

// insertNoise puts block comments before random tokens, and line comments and blank lines before tokens that start a line.
func insertNoise(rng *rand.Rand, text string, starts []int) string {
	picked := map[int]string{}
	for range 1 + rng.Intn(8) {
		offset := starts[rng.Intn(len(starts))]
		// A line holding a directive marker counts as code, so noise there is a real change.
		if onDirectiveLine(text, offset) {
			continue
		}
		switch {
		case atLineStart(text, offset) && rng.Intn(2) == 0:
			picked[offset] = "// noise " + strings.Repeat("x", rng.Intn(5)) + "\n\n"
		default:
			picked[offset] = "/* noise\n */ "
			if !atLineStart(text, offset) {
				picked[offset] = "/* noise */ "
			}
		}
	}
	offsets := make([]int, 0, len(picked))
	for offset := range picked {
		offsets = append(offsets, offset)
	}
	sort.Sort(sort.Reverse(sort.IntSlice(offsets)))
	for _, offset := range offsets {
		text = text[:offset] + picked[offset] + text[offset:]
	}
	return text
}

func onDirectiveLine(text string, offset int) bool {
	lineStart := strings.LastIndexByte(text[:offset], '\n') + 1
	lineEnd := strings.IndexByte(text[offset:], '\n')
	if lineEnd == -1 {
		lineEnd = len(text) - offset
	}
	line := text[lineStart : offset+lineEnd]
	return len(directiveLines(line, tsDirectives)) > 0 || len(directiveLines(line, goDirectives)) > 0
}

var identifier = regexp.MustCompile(`\b[A-Za-z_][A-Za-z0-9_]{2,}\b`)

// Every repo file must digest without a raw fallback, so the lanes really skip comment-only commits.
func TestDigest_EveryRepoFileDigests(t *testing.T) {
	root, files := repoCodeFiles(t)
	var fellBack []string
	for _, file := range files {
		text, err := os.ReadFile(filepath.Join(root, file))
		if err != nil {
			continue
		}
		if _, ok := digest(file, string(text)); !ok {
			fellBack = append(fellBack, file)
		}
	}
	if len(fellBack) > 0 {
		t.Fatalf("%d repo files fall back to raw hashing (fix the file, or teach code-digest its syntax):\n%s", len(fellBack), strings.Join(fellBack, "\n"))
	}
}

// Seeded sweep over real repo files: noise keeps the digest, a renamed identifier moves it.
// Replay a reported seed with MION_FUZZ_SEED.
func TestFuzz_NoiseKeepsTheDigest(t *testing.T) {
	if testing.Short() {
		t.Skip("randomized sweep skipped under -short")
	}
	seed, origin, err := testfixtures.FuzzSeed("code-digest")
	if err != nil {
		t.Fatal(err)
	}
	t.Log(origin)
	rng := rand.New(rand.NewSource(seed))
	root, files := repoCodeFiles(t)
	for range 300 {
		file := files[rng.Intn(len(files))]
		raw, err := os.ReadFile(filepath.Join(root, file))
		if err != nil {
			continue
		}
		text := string(raw)
		before, ok := digest(file, text)
		if !ok {
			continue
		}
		ranges := tokenRanges(t, file, text)
		if len(ranges) == 0 {
			continue
		}
		starts := make([]int, len(ranges))
		for i, span := range ranges {
			starts[i] = span[0]
		}
		noisy := insertNoise(rng, text, starts)
		if after, ok := digest(file, noisy); !ok || after != before {
			t.Fatalf("seed %d: comments or blank lines moved the digest of %s (fallback=%v)\n--- noisy ---\n%s", seed, file, !ok, noisy)
		}
		names := identifier.FindAllStringIndex(text, -1)
		if len(names) == 0 {
			continue
		}
		name := names[rng.Intn(len(names))]
		renamed := text[:name[1]] + "Q" + text[name[1]:]
		// A name inside a comment is noise too, so only a name inside a code token must move it.
		if after, ok := digest(file, renamed); ok && after == before && insideCode(ranges, name[0]) {
			t.Fatalf("seed %d: renaming %q at %d in %s kept the digest", seed, text[name[0]:name[1]], name[0], file)
		}
	}
}
