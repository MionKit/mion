package resolver_test

import (
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mionkit/mion/ts-go-runtypes/internal/cachegen/diskcache"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/program"
	"github.com/mionkit/mion/ts-go-runtypes/internal/compiler/resolver"
	"github.com/mionkit/mion/ts-go-runtypes/internal/diagnostics"
	"github.com/mionkit/mion/ts-go-runtypes/internal/jsengine"
)

// stagedVerdict is what a loaded stagedEngine answers with.
type stagedVerdict int

const (
	// stagedTimeoutVerdict: every sample and every draw runs out of budget.
	stagedTimeoutVerdict stagedVerdict = iota
	// stagedCompileError: the pattern does not compile (validate lane). A
	// property of the type, so it must keep replaying from the disk cache.
	stagedCompileError
	// stagedGenerateError: the generator cannot draw samples (generate
	// lane); validation itself answers clean. Also a property of the type.
	stagedGenerateError
)

// stagedEngine stands in for the sidecar so a load spike can be staged
// deterministically: while `loaded` it answers with the staged verdict; once
// quiet it answers clean, generating samples like a real engine would.
type stagedEngine struct {
	loaded  bool
	verdict stagedVerdict
}

const stagedTimeout = "pattern evaluation timed out on a 2-character sample; the pattern may backtrack catastrophically"

func (engine *stagedEngine) TestPattern(_, _ string, _ []string) (jsengine.TestResult, error) {
	if !engine.loaded {
		return jsengine.TestResult{}, nil
	}
	switch engine.verdict {
	case stagedCompileError:
		return jsengine.TestResult{CompileError: "Invalid regular expression: staged"}, nil
	case stagedGenerateError:
		return jsengine.TestResult{}, nil
	}
	return jsengine.TestResult{TimedOut: stagedTimeout}, nil
}

func (engine *stagedEngine) GeneratePattern(_ jsengine.GenerateRequest) (jsengine.GenerateResult, error) {
	if !engine.loaded {
		return jsengine.GenerateResult{Values: []string{"abc"}}, nil
	}
	switch engine.verdict {
	case stagedCompileError:
		return jsengine.GenerateResult{CompileError: "Invalid regular expression: staged"}, nil
	case stagedGenerateError:
		return jsengine.GenerateResult{GenerateError: "staged: the generator cannot handle this construct"}, nil
	}
	return jsengine.GenerateResult{TimedOut: stagedTimeout}, nil
}

// cachedDiagnosticCodes walks a disk-cache root and collects every diagnostic
// code any persisted entry carries.
func cachedDiagnosticCodes(t testing.TB, root string) map[string]bool {
	t.Helper()
	codes := map[string]bool{}
	err := filepath.WalkDir(root, func(path string, entry fs.DirEntry, err error) error {
		if err != nil || entry.IsDir() || !strings.HasSuffix(path, ".json") {
			return err
		}
		raw, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		var cached diskcache.RTEntry
		if err := json.Unmarshal(raw, &cached); err != nil {
			return err
		}
		for _, diagnostic := range cached.Diagnostics {
			codes[diagnostic.Code] = true
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking the disk cache at %s: %v", root, err)
	}
	return codes
}

// TestPatternTimeout_NeverReplayedFromDiskCache pins the fix for the
// poisoned-cache finding: a build on a saturated host blew the sidecar's
// match budget on a fine pattern, the resulting Error was written into the
// disk cache with its entry, and every later build on an idle machine halted
// on it until the cache was deleted by hand. A timeout is a verdict about
// that build's machine, not about the type, so the entry is never persisted
// and the next build judges the pattern again.
//
// Each lane runs TWO sessions sharing one cache dir: a loaded one, then a
// quiet one. The control lanes stage the permanent verdict for the same
// pattern shape and prove the quiet session still sees it, which is both the
// v16 contract (warm builds report what cold builds do) and the proof that the
// two sessions really share the cache, so the timeout lanes' silence means
// "not persisted", not "not cached at all".
func TestPatternTimeout_NeverReplayedFromDiskCache(t *testing.T) {
	declaredSamples := lookbehindSource("ab")
	lanes := []struct {
		name    string
		source  string
		verdict stagedVerdict
		// loadedCode is the diagnostic the loaded session must raise;
		// replayed says whether the quiet session must still carry it.
		loadedCode string
		replayed   bool
	}{
		{"validate timeout is transient", declaredSamples, stagedTimeoutVerdict, diagnostics.CodeFMTPatternTimeout, false},
		{"validate compile error stays cached (control)", declaredSamples, stagedCompileError, diagnostics.CodeFMTInvalidParams, true},
		{"generate timeout is transient", samplelessPatternSource, stagedTimeoutVerdict, diagnostics.CodeFMTPatternTimeout, false},
		{"generate failure stays cached (control)", samplelessPatternSource, stagedGenerateError, diagnostics.CodeFMTSampleGenFailed, true},
	}
	for _, lane := range lanes {
		t.Run(lane.name, func(t *testing.T) {
			cacheDir := t.TempDir()
			engine := &stagedEngine{loaded: true, verdict: lane.verdict}
			withStagedEngine := func(programOpts *program.Options, resolverOpts *resolver.Options) {
				withSampleKnobs(5, 10)(programOpts, resolverOpts)
				resolverOpts.CacheDir = cacheDir
				resolverOpts.JSEngine = engine
			}
			sources := map[string]string{"a.ts": lane.source}

			loaded := generationScan(t, setupInlineWith(t, sources, withStagedEngine))
			found := findDiag(loaded, lane.loadedCode)
			if found == nil {
				t.Fatalf("loaded session: expected %s, got %+v", lane.loadedCode, loaded.Diagnostics)
			}
			if found.Severity != diagnostics.SeverityError {
				t.Errorf("loaded session: %s severity got %d want %d (error): the build it was raised in must still halt", lane.loadedCode, found.Severity, diagnostics.SeverityError)
			}
			if lane.loadedCode == diagnostics.CodeFMTPatternTimeout {
				if len(found.Args) < 2 || found.Args[1] != stagedTimeout {
					t.Errorf("expected [pattern source, sidecar reason] args, got %+v", found.Args)
				}
				// The timeout is its own lane: never dressed up as the permanent verdicts.
				for _, permanentCode := range []string{diagnostics.CodeFMTInvalidParams, diagnostics.CodeFMTSampleGenFailed} {
					if stray := findDiag(loaded, permanentCode); stray != nil {
						t.Errorf("a timeout must not surface as %s: %+v", permanentCode, stray)
					}
				}
			}
			codes := cachedDiagnosticCodes(t, cacheDir)
			if codes[lane.loadedCode] != lane.replayed {
				t.Errorf("disk cache carries %s: got %v want %v (codes on disk: %v)", lane.loadedCode, codes[lane.loadedCode], lane.replayed, codes)
			}

			engine.loaded = false
			quiet := generationScan(t, setupInlineWith(t, sources, withStagedEngine))
			if got := findDiag(quiet, lane.loadedCode); (got != nil) != lane.replayed {
				t.Fatalf("quiet session: %s present=%v want %v; diagnostics %+v", lane.loadedCode, got != nil, lane.replayed, quiet.Diagnostics)
			}
			if !lane.replayed {
				for _, diagnostic := range quiet.Diagnostics {
					if strings.HasPrefix(diagnostic.Code, "FMT") {
						t.Errorf("quiet session must build clean, got %s %+v", diagnostic.Code, diagnostic.Args)
					}
				}
			}
		})
	}
}

// TestPatternTimeout_NotMemoizedWithinSession covers watch mode, where one
// resolver session outlives the load spike: the walker asks the engine again
// on the next scan instead of replaying the session's first verdict.
func TestPatternTimeout_NotMemoizedWithinSession(t *testing.T) {
	engine := &stagedEngine{loaded: true}
	session := setupInlineWith(t, map[string]string{"a.ts": lookbehindSource("ab")},
		func(programOpts *program.Options, resolverOpts *resolver.Options) {
			programOpts.SingleThreaded = true
			resolverOpts.SingleThreaded = true
			resolverOpts.JSEngine = engine
		})
	if found := findDiag(scanBuild(t, session), diagnostics.CodeFMTPatternTimeout); found == nil {
		t.Fatal("loaded scan: expected FMT007")
	}
	engine.loaded = false
	if found := findDiag(scanBuild(t, session), diagnostics.CodeFMTPatternTimeout); found != nil {
		t.Fatalf("quiet rescan in the same session must re-judge the pattern, got %+v", found)
	}
}
