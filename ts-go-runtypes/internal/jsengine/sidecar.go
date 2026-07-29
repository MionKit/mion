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
)

// The committed sidecar bundle, generated from the private
// @ts-runtypes/go-be-sidecar workspace package by
// `pnpm rtx core codegen sidecar` (drift-gated in CI).
//
//go:embed sidecar.bundle.mjs
var sidecarBundle string

// EnvRuntime overrides the JS runtime path when no --js-runtime flag is
// given. Registered in scripts/lib/env.mjs.
const EnvRuntime = "RT_JS_RUNTIME"

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

type memoEntry struct {
	result TestResult
	err    error
}

// Wire shapes; field names follow the JSON tags per house style.
type sidecarJob struct {
	ID      int      `json:"id"`
	Op      string   `json:"op"`
	Source  string   `json:"source"`
	Flags   string   `json:"flags"`
	Samples []string `json:"samples"`
}

type sidecarResult struct {
	ID           int      `json:"id"`
	CompileError string   `json:"compileError"`
	Offenders    []string `json:"offenders"`
	Error        string   `json:"error"`
}

type sidecarResponse struct {
	V       int             `json:"v"`
	Results []sidecarResult `json:"results"`
	Error   string          `json:"error"`
}

// NewSidecar returns the native engine. runtimePath is the --js-runtime
// value ("" = resolve via RT_JS_RUNTIME, then node, then bun in PATH).
// Construction never fails: a missing runtime surfaces as an error from
// TestPattern so pattern-free projects never notice.
func NewSidecar(runtimePath string) Engine {
	return &sidecarEngine{explicitRuntime: runtimePath, timeout: defaultRoundTripTimeout, memo: make(map[string]memoEntry)}
}

func (engine *sidecarEngine) TestPattern(source, flags string, samples []string) (TestResult, error) {
	key := source + "\x00" + flags + "\x00" + strings.Join(samples, "\x01")
	engine.mu.Lock()
	defer engine.mu.Unlock()
	if entry, ok := engine.memo[key]; ok {
		return entry.result, entry.err
	}
	result, err := engine.roundTrip(source, flags, samples)
	engine.memo[key] = memoEntry{result: result, err: err}
	return result, err
}

// roundTrip sends one single-job request and reads its response line.
// Caller holds engine.mu.
func (engine *sidecarEngine) roundTrip(source, flags string, samples []string) (TestResult, error) {
	if engine.dead != nil {
		return TestResult{}, engine.dead
	}
	if !engine.started {
		if err := engine.start(); err != nil {
			engine.dead = err
			return TestResult{}, err
		}
	}
	engine.nextID++
	request, err := json.Marshal(map[string]any{"v": 1, "jobs": []sidecarJob{{ID: engine.nextID, Op: "validate", Source: source, Flags: flags, Samples: samples}}})
	if err != nil {
		return TestResult{}, engine.fail(fmt.Errorf("sidecar request marshal: %w", err))
	}
	if _, err := engine.stdin.Write(append(request, '\n')); err != nil {
		return TestResult{}, engine.fail(fmt.Errorf("sidecar write: %w", err))
	}
	line, err := engine.readLine()
	if err != nil {
		return TestResult{}, engine.fail(err)
	}
	var response sidecarResponse
	if err := json.Unmarshal(line, &response); err != nil {
		return TestResult{}, engine.fail(fmt.Errorf("sidecar response parse: %w", err))
	}
	if response.Error != "" {
		return TestResult{}, engine.fail(errors.New("sidecar: " + response.Error))
	}
	if len(response.Results) != 1 || response.Results[0].ID != engine.nextID {
		return TestResult{}, engine.fail(errors.New("sidecar: response does not match the request"))
	}
	result := response.Results[0]
	if result.Error != "" {
		return TestResult{}, engine.fail(errors.New("sidecar: " + result.Error))
	}
	return TestResult{CompileError: result.CompileError, Offenders: result.Offenders}, nil
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
// the RT_JS_RUNTIME env override, then node, then bun from PATH. An
// explicit or env path is trusted as given — a bad one fails at spawn
// with a clear message rather than silently running something else
// (the RT_BIN doctrine).
func resolveRuntime(explicit string) (string, error) {
	if explicit != "" {
		return explicit, nil
	}
	if env := os.Getenv(EnvRuntime); env != "" {
		return env, nil
	}
	if path, err := exec.LookPath("node"); err == nil {
		return path, nil
	}
	if path, err := exec.LookPath("bun"); err == nil {
		return path, nil
	}
	return "", errors.New("no JS runtime found (looked for node, then bun, in PATH) — install one or pass --js-runtime / " + EnvRuntime)
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
