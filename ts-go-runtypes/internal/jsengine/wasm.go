//go:build js && wasm

package jsengine

import (
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"syscall/js"
)

// HookGlobalName is the synchronous host callback the playground installs
// (the sidecar bundle's hook build): request-line JSON in, response-line
// JSON out — the exact stdio sidecar contract, minus the process. When
// present, BOTH ops route through it, so the browser generates the same
// deterministic samples as a native build (same wire jobs, same seeds).
const HookGlobalName = "__tsRunTypesJsEngine"

// hostEngine answers pattern jobs through the WASM host — the host IS a
// JS engine, so there is no subprocess and no sidecar bundle involved.
// Single-threaded by construction (the WASM twin runs SingleThreaded),
// so no locking is needed.
type hostEngine struct {
	nextID int
	// sessionKey mirrors sidecarEngine.sessionKey: the per-session random
	// run key unpinned generation mixes in (fresh per page load / module
	// instantiation).
	sessionKey uint32
}

// NewHostEngine returns the WASM engine: the host hook when installed,
// direct host RegExp otherwise (validation only — generation needs the
// hook's randexp).
func NewHostEngine() Engine {
	return &hostEngine{sessionKey: newSessionKey()}
}

func (engine *hostEngine) TestPattern(source, flags string, samples []string) (TestResult, error) {
	if hook, ok := engineHook(); ok {
		result, err := engine.callHook(hook, sidecarJob{Op: "validate", Source: source, Flags: flags, Samples: samples})
		if err == nil {
			return TestResult{CompileError: result.CompileError, Offenders: result.Offenders}, nil
		}
		// A broken hook must never make validation worse than having no
		// hook at all — fall through to the direct RegExp path.
	}
	// Strip g/y: `.test` advances lastIndex on global/sticky regexes — the
	// same statefulness guard the sidecar and registerFormatPattern apply.
	stripped := strings.Map(func(r rune) rune {
		if r == 'g' || r == 'y' {
			return -1
		}
		return r
	}, flags)
	regExp, compileError := compileHostRegExp(source, stripped)
	if compileError != "" {
		return TestResult{CompileError: compileError}, nil
	}
	var offenders []string
	for _, sample := range samples {
		if !regExp.Call("test", sample).Bool() {
			offenders = append(offenders, sample)
		}
	}
	return TestResult{Offenders: offenders}, nil
}

func (engine *hostEngine) GeneratePattern(req GenerateRequest) (GenerateResult, error) {
	hook, ok := engineHook()
	if !ok {
		return GenerateResult{GenerateError: "sample generation is not available here (no " + HookGlobalName + " host hook installed)"}, nil
	}
	result, err := engine.callHook(hook, generateJobFor(req, resolveRunKey(req, engine.sessionKey)))
	if err != nil {
		// Degrade like an ungeneratable pattern (declare mockSamples), not
		// like a missing runtime — the host itself is alive and validating.
		return GenerateResult{GenerateError: "host hook failed: " + err.Error()}, nil
	}
	return GenerateResult{CompileError: result.CompileError, GenerateError: result.GenerateError, Values: result.Values}, nil
}

// engineHook returns the installed host hook, if any.
func engineHook() (js.Value, bool) {
	hook := js.Global().Get(HookGlobalName)
	if hook.Type() == js.TypeFunction {
		return hook, true
	}
	return js.Value{}, false
}

// callHook drives one job through the host hook. A throwing hook
// surfaces as an error (syscall/js panics are recovered), never a crash.
func (engine *hostEngine) callHook(hook js.Value, job sidecarJob) (result sidecarResult, err error) {
	defer func() {
		if recovered := recover(); recovered != nil {
			result, err = sidecarResult{}, fmt.Errorf("hook: %v", recovered)
		}
	}()
	engine.nextID++
	job.ID = engine.nextID
	request, err := json.Marshal(map[string]any{"v": 1, "jobs": []sidecarJob{job}})
	if err != nil {
		return sidecarResult{}, fmt.Errorf("hook request marshal: %w", err)
	}
	responseLine := hook.Invoke(string(request))
	if responseLine.Type() != js.TypeString {
		return sidecarResult{}, errors.New("hook: response is not a string")
	}
	var response sidecarResponse
	if err := json.Unmarshal([]byte(responseLine.String()), &response); err != nil {
		return sidecarResult{}, fmt.Errorf("hook response parse: %w", err)
	}
	if response.Error != "" {
		return sidecarResult{}, errors.New("hook: " + response.Error)
	}
	if len(response.Results) != 1 || response.Results[0].ID != job.ID {
		return sidecarResult{}, errors.New("hook: response does not match the request")
	}
	if response.Results[0].Error != "" {
		return sidecarResult{}, errors.New("hook: " + response.Results[0].Error)
	}
	return response.Results[0], nil
}

// compileHostRegExp constructs the host RegExp, converting the thrown
// SyntaxError (a syscall/js panic) into a CompileError message.
func compileHostRegExp(source, flags string) (regExp js.Value, compileError string) {
	defer func() {
		if recovered := recover(); recovered != nil {
			if jsErr, ok := recovered.(js.Error); ok {
				compileError = jsErr.Value.Get("message").String()
				return
			}
			compileError = fmt.Sprint(recovered)
		}
	}()
	regExp = js.Global().Get("RegExp").New(source, flags)
	return regExp, ""
}
