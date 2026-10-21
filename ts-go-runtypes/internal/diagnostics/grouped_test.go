package diagnostics

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// groupedCase is one row of testdata/grouped/cases.json, the corpus the TS twin in
// packages/devtools reads too, so both print the same bytes.
type groupedCase struct {
	Name    string         `json:"name"`
	Cwd     string         `json:"cwd,omitempty"`
	Entries []GroupedEntry `json:"entries"`
	Want    string         `json:"want"`
}

func TestFormatGrouped_SharedCorpus(t *testing.T) {
	corpusPath := filepath.Join("testdata", "grouped", "cases.json")
	data, err := os.ReadFile(corpusPath)
	if err != nil {
		t.Fatal(err)
	}
	var cases []groupedCase
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	if os.Getenv("MION_UPDATE_GOLDEN") == "1" {
		for index := range cases {
			cases[index].Want = FormatGrouped(cases[index].Entries, cases[index].Cwd)
		}
		var out strings.Builder
		encoder := json.NewEncoder(&out)
		encoder.SetEscapeHTML(false)
		encoder.SetIndent("", "  ")
		if err := encoder.Encode(cases); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(corpusPath, []byte(out.String()), 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	for _, testCase := range cases {
		t.Run(testCase.Name, func(t *testing.T) {
			if got := FormatGrouped(testCase.Entries, testCase.Cwd); got != testCase.Want {
				t.Errorf("FormatGrouped:\n%s\nwant:\n%s", got, testCase.Want)
			}
		})
	}
}

// TestFormatGrouped_RandomCorpus: the random cases packages/devtools/test/grouped-log.fuzz.test.ts writes,
// with the bytes its TS twin printed; CI runs the two in different jobs, so the file is the bridge.
func TestFormatGrouped_RandomCorpus(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("testdata", "grouped", "random.json"))
	if err != nil {
		t.Fatal(err)
	}
	var corpus struct {
		Cwd   string `json:"cwd"`
		Cases []struct {
			Seed    int            `json:"seed"`
			Entries []GroupedEntry `json:"entries"`
			Want    string         `json:"want"`
		} `json:"cases"`
	}
	if err := json.Unmarshal(data, &corpus); err != nil {
		t.Fatal(err)
	}
	if len(corpus.Cases) < 50 {
		t.Fatalf("expected the random corpus, got %d cases", len(corpus.Cases))
	}
	for _, testCase := range corpus.Cases {
		if got := FormatGrouped(testCase.Entries, corpus.Cwd); got != testCase.Want {
			t.Errorf("seed %d: Go printed\n%s\nTS printed\n%s", testCase.Seed, got, testCase.Want)
		}
	}
}

func TestEntryOf(t *testing.T) {
	diagnostic := New(CodeVLSymbolRoot, Site{FilePath: "a.ts", StartLine: 3, StartCol: 1}, "Symbol")
	entry := EntryOf(diagnostic, false)
	if entry.Severity != SeverityError || entry.Name != CodeVLSymbolRoot || entry.Template != Definitions[CodeVLSymbolRoot].Headline || len(entry.Slots) != 1 {
		t.Fatalf("EntryOf = %+v", entry)
	}
	if downgraded := EntryOf(diagnostic, true); downgraded.Severity != SeverityWarning || !downgraded.Downgraded {
		t.Fatalf("a downgraded entry prints as a warning, got %+v", downgraded)
	}
	if unknown := EntryOf(Diagnostic{Code: "no-such-code", Severity: SeverityError}, false); !strings.HasPrefix(unknown.Template, "Unrecognised diagnostic code") || unknown.Slots != nil {
		t.Fatalf("an unknown code prints the fallback text, got %+v", unknown)
	}
}

// Every finding's location and slot values must survive grouping, and the twin with `lines` must say the same thing.
func TestFormatGrouped_KeepsEveryFinding(t *testing.T) {
	var entries []GroupedEntry
	for index, typeName := range []string{"Socket", "FileHandle", "FileHandle", "Pipe"} {
		entries = append(entries, EntryOf(New(CodeVLSymbolRoot, Site{FilePath: "src/f.ts", StartLine: index + 1, StartCol: 2}, typeName), false))
	}
	got := FormatGrouped(entries, "")
	for index, typeName := range []string{"Socket", "FileHandle", "FileHandle", "Pipe"} {
		line := "src/f.ts:" + string(rune('1'+index)) + ":2  type=" + typeName
		if !strings.Contains(got, line) {
			t.Errorf("missing %q in:\n%s", line, got)
		}
	}
	if strings.Count(got, "can never be validated") != 1 {
		t.Errorf("the message must print once:\n%s", got)
	}
}
