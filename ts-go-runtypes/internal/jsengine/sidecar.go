//go:build !js

package jsengine

import (
	"bufio"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/mionkit/mion/ts-go-runtypes/internal/envcompat"
)

// The committed sidecar bundle, generated from the private
// @mionjs/go-be-sidecar workspace package by
// `pnpm miondevx core codegen sidecar` (drift-gated in CI).
//
//go:embed sidecar.bundle.mjs
var sidecarBundle string

// EnvRuntime overrides the JS runtime path when no --js-runtime flag is
// given. Registered in scripts/lib/env.mjs.
const EnvRuntime = "MION_JS_RUNTIME"

// defaultRoundTripTimeout bounds one sidecar request; a hang kills the
// child and marks the engine dead.
const defaultRoundTripTimeout = 5 * time.Second

// sidecarEngine drives ONE session-long sidecar child over
// newline-delimited JSON (the same framing the resolver itself speaks to
// the bundler plugin): lazily spawned on first use, mutex-serialized
// round-trips, verdicts memoized so watch-mode rebuilds re-ask nothing.
// Any spawn/timeout/protocol failure is sticky — later calls fail fast
// and the caller degrades to the missing-runtime diagnostic.
type sidecarEngine struct {
	explicitRuntime string
	timeout         time.Duration
	// sessionKey is the per-session random run key unpinned GeneratePattern
	// requests mix into their seed — rolled once at construction, so pools
	// stay stable across a session's dispatches and re-roll per build.
	sessionKey uint32

	mu         sync.Mutex
	started    bool
	dead       error
	bundlePath string
	child      *exec.Cmd
	stdin      io.WriteCloser
	stdout     *bufio.Reader
	nextID     int
	memo       map[string]memoEntry
}

// memoEntry caches one job's raw wire result (wire shapes live in
// wire.go, shared with the WASM transport).
type memoEntry struct {
	result sidecarResult
	err    error
}

// NewSidecar returns the native engine. runtimePath is the --js-runtime
// value ("" = resolve via MION_JS_RUNTIME, then node, then bun in PATH).
// Construction never fails: a missing runtime surfaces as an error from
// TestPattern so pattern-free projects never notice.
func NewSidecar(runtimePath string) Engine {
	return &sidecarEngine{explicitRuntime: runtimePath, timeout: defaultRoundTripTimeout, sessionKey: newSessionKey(), memo: make(map[string]memoEntry)}
}

func (engine *sidecarEngine) TestPattern(source, flags string, samples []string) (TestResult, error) {
	key := "validate\x00" + source + "\x00" + flags + "\x00" + strings.Join(samples, "\x01")
	entry := engine.memoizedRoundTrip(key, sidecarJob{Op: "validate", Source: source, Flags: flags, Samples: samples})
	return TestResult{CompileError: entry.result.CompileError, TimedOut: entry.result.TimedOut, Offenders: entry.result.Offenders}, entry.err
}

func (engine *sidecarEngine) GeneratePattern(req GenerateRequest) (GenerateResult, error) {
	job := generateJobFor(req, resolveRunKey(req, engine.sessionKey))
	key := fmt.Sprintf("generate\x00%s\x00%s\x00%d\x00%d\x00%d\x00%d\x00%d", job.Source, job.Flags, job.Count, job.MaxAttempts, job.MinLength, job.MaxLength, job.Seed)
	entry := engine.memoizedRoundTrip(key, job)
	return GenerateResult{CompileError: entry.result.CompileError, GenerateError: entry.result.GenerateError, TimedOut: entry.result.TimedOut, Values: entry.result.Values}, entry.err
}

// memoizedRoundTrip answers a job from the memo, round-tripping through
// the child only on the first ask for its key.
func (engine *sidecarEngine) memoizedRoundTrip(key string, job sidecarJob) memoEntry {
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if entry, ok := engine.memo[key]; ok {
		return entry
	}
	result, err := engine.roundTrip(job)
	entry := memoEntry{result: result, err: err}
	// A timed-out verdict describes the host's load at that moment, not the
	// pattern: never memoize it, so the next ask (a watch-mode rebuild on a
	// quieter machine) evaluates the pattern afresh instead of replaying the
	// spike for the rest of the session.
	if result.TimedOut == "" {
		engine.memo[key] = entry
	}
	return entry
}

// roundTrip sends one single-job request (assigning its wire ID) and
// reads its response line. Caller holds engine.mu.
func (engine *sidecarEngine) roundTrip(job sidecarJob) (sidecarResult, error) {
	if engine.dead != nil {
		return sidecarResult{}, engine.dead
	}
	if !engine.started {
		if err := engine.start(); err != nil {
			engine.dead = err
			return sidecarResult{}, err
		}
	}
	engine.nextID++
	job.ID = engine.nextID
	request, err := json.Marshal(map[string]any{"v": 1, "jobs": []sidecarJob{job}})
	if err != nil {
		return sidecarResult{}, engine.fail(fmt.Errorf("sidecar request marshal: %w", err))
	}
	if _, err := engine.stdin.Write(append(request, '\n')); err != nil {
		return sidecarResult{}, engine.fail(fmt.Errorf("sidecar write: %w", err))
	}
	line, err := engine.readLine()
	if err != nil {
		return sidecarResult{}, engine.fail(err)
	}
	var response sidecarResponse
	if err := json.Unmarshal(line, &response); err != nil {
		return sidecarResult{}, engine.fail(fmt.Errorf("sidecar response parse: %w", err))
	}
	if response.Error != "" {
		return sidecarResult{}, engine.fail(errors.New("sidecar: " + response.Error))
	}
	if len(response.Results) != 1 || response.Results[0].ID != job.ID {
		return sidecarResult{}, engine.fail(errors.New("sidecar: response does not match the request"))
	}
	result := response.Results[0]
	if result.Error != "" {
		return sidecarResult{}, engine.fail(errors.New("sidecar: " + result.Error))
	}
	return result, nil
}

// readLine reads one response line under the round-trip timeout. On
// timeout the child is killed so the pending read unblocks and exits.
func (engine *sidecarEngine) readLine() ([]byte, error) {
	type lineRead struct {
		line []byte
		err  error
	}
	read := make(chan lineRead, 1)
	go func() {
		line, err := engine.stdout.ReadBytes('\n')
		read <- lineRead{line: line, err: err}
	}()
	select {
	case got := <-read:
		if got.err != nil {
			return nil, fmt.Errorf("sidecar read: %w", got.err)
		}
		return got.line, nil
	case <-time.After(engine.timeout):
		return nil, errors.New("sidecar timed out")
	}
}

// fail marks the engine dead (sticky), tears the child down, and returns
// the error for the caller to propagate. Caller holds engine.mu.
func (engine *sidecarEngine) fail(err error) error {
	engine.dead = err
	if engine.child != nil {
		if engine.stdin != nil {
			engine.stdin.Close()
		}
		if engine.child.Process != nil {
			engine.child.Process.Kill()
		}
		child := engine.child
		go child.Wait()
		engine.child = nil
	}
	return err
}

// start resolves the runtime, materializes the embedded bundle, and
// spawns the session-long child. Caller holds engine.mu.
func (engine *sidecarEngine) start() error {
	engine.started = true
	runtimePath, err := resolveRuntime(engine.explicitRuntime)
	if err != nil {
		return err
	}
	bundlePath, err := materializeBundle()
	if err != nil {
		return err
	}
	engine.bundlePath = bundlePath
	child := exec.Command(runtimePath, bundlePath)
	child.Stderr = io.Discard
	stdin, err := child.StdinPipe()
	if err != nil {
		return fmt.Errorf("sidecar stdin: %w", err)
	}
	stdout, err := child.StdoutPipe()
	if err != nil {
		return fmt.Errorf("sidecar stdout: %w", err)
	}
	if err := child.Start(); err != nil {
		return fmt.Errorf("sidecar spawn (%s): %w", runtimePath, err)
	}
	engine.child = child
	engine.stdin = stdin
	engine.stdout = bufio.NewReader(stdout)
	return nil
}

// resolveRuntime picks the JS runtime: explicit --js-runtime flag, then
// the MION_JS_RUNTIME env override, then node, then bun from PATH. An
// explicit or env path is trusted as given — a bad one fails at spawn
// with a clear message rather than silently running something else
// (the MION_BIN doctrine).
func resolveRuntime(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if env := envcompat.Getenv(EnvRuntime); env != "" {
		return env, nil
	}
	if path, err := exec.LookPath("node"); err == nil {
		return path, nil
	}
	if path, err := exec.LookPath("bun"); err == nil {
		return path, nil
	}
	return "", errors.New("no JS runtime found (looked for node, then bun, in PATH) — install one, or point --js-runtime / " + EnvRuntime + " at any node-compatible runtime")
}

// materializeBundle writes the embedded sidecar to a content-hash-named
// file under the OS temp dir (reused across runs and processes) and
// returns its path. Atomic same-directory rename so concurrent resolvers
// never see a partial file.
func materializeBundle() (string, error) {
	sum := sha256.Sum256([]byte(sidecarBundle))
	path := filepath.Join(os.TempDir(), "ts-runtypes-sidecar-"+hex.EncodeToString(sum[:8])+".mjs")
	if info, err := os.Stat(path); err == nil && info.Size() == int64(len(sidecarBundle)) {
		return path, nil
	}
	scratch, err := os.CreateTemp(filepath.Dir(path), ".ts-runtypes-sidecar-*")
	if err != nil {
		return "", fmt.Errorf("sidecar materialize: %w", err)
	}
	if _, err := scratch.WriteString(sidecarBundle); err != nil {
		scratch.Close()
		os.Remove(scratch.Name())
		return "", fmt.Errorf("sidecar materialize: %w", err)
	}
	if err := scratch.Close(); err != nil {
		os.Remove(scratch.Name())
		return "", fmt.Errorf("sidecar materialize: %w", err)
	}
	if err := os.Rename(scratch.Name(), path); err != nil {
		os.Remove(scratch.Name())
		return "", fmt.Errorf("sidecar materialize: %w", err)
	}
	return path, nil
}
