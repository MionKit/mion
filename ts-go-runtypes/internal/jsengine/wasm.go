//go:build js && wasm

package jsengine

import (
	"fmt"
	"strings"
	"syscall/js"
)

// hostEngine answers pattern jobs directly through the WASM host — the
// host IS a JS engine, so there is no subprocess and no sidecar bundle
// involved. Single-threaded by construction (the WASM twin runs
// SingleThreaded), so no locking is needed.
type hostEngine struct{}

// NewHostEngine returns the WASM engine backed by the host's own RegExp.
func NewHostEngine() Engine {
	return hostEngine{}
}

func (hostEngine) TestPattern(source, flags string, samples []string) (TestResult, error) {
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
