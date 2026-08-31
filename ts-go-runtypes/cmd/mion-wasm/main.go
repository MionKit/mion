// Command ts-runtypes-wasm is the WebAssembly build of the mion
// resolver. It compiles the same in-memory tsgo-backed resolver that the
// native binary serves over stdio, but exposes it to a JavaScript host
// through a single synchronous callback instead of newline-delimited JSON
// on stdio.
//
// The host calls the global function installed on `globalThis`:
//
//	const responseJSON = globalThis.__tsRunTypesDispatch(requestJSON);
//
// Both arguments are JSON strings using the exact same protocol.Request /
// protocol.Response wire shapes the native binary speaks — so a caller can
// drive setSources / scanFiles / dump identically to the
// `--inline-server` CLI mode, no Unix socket and no child process.
//
// The resolver runs single-threaded with the parallel scan + render disabled
// because the js/wasm runtime is cooperatively scheduled on one OS thread;
// the parallel checker pool buys nothing there and only adds scheduling risk.

//go:build js && wasm

package main

import (
	"encoding/json"
	"fmt"
	"syscall/js"

	// Blank-import the format-emitter aggregator so every concrete format
	// registers before the resolver hands out RunTypes — same as the native
	// binary's main.
	_ "github.com/mionkit/ts-runtypes/internal/cachegen/typefunctions/formats/all"
	"github.com/mionkit/ts-runtypes/internal/compiler/marker"
	"github.com/mionkit/ts-runtypes/internal/compiler/resolver"
	"github.com/mionkit/ts-runtypes/internal/constants"
	"github.com/mionkit/ts-runtypes/internal/jsengine"
	"github.com/mionkit/ts-runtypes/internal/protocol"
)

// wasmCwd is the virtual working directory every relative source path in a
// setSources request is resolved against. It never touches a real disk —
// the inferred Program reads source text from the in-memory overlay and the
// TypeScript lib files from tsgo's embedded bundled FS.
const wasmCwd = "/virtual"

func main() {
	serverResolver := resolver.NewServer(resolver.Options{
		Cwd:                   wasmCwd,
		Marker:                marker.Options{},
		SingleThreaded:        true,
		DisableParallelScan:   true,
		DisableParallelRender: true,
		// Pattern checks run directly on the host's own RegExp — the WASM
		// module already lives inside a JS engine, so no sidecar is spawned.
		JSEngine: jsengine.NewHostEngine(),
		// EmitFunctions ships each cache entry's factory as a LIVE `function
		// g_<hash>(utl){…}` (code slot undefined) instead of a body string the
		// runtime rebuilds via `new Function`. The playground's "Generated Cache"
		// view then shows a real, readable function rather than an escaped string.
		EmitMode: constants.EmitFunctions,
		// The playground resolver inlines every child and bundles everything into
		// one cache: the generated-code view reads a single self-contained entry
		// (no helper entries split into sibling modules it wouldn't show), and the
		// linked-in-browser run path has one module to materialize.
		InlineMode: constants.InlineModeAllInternal,
		ModuleMode: constants.ModuleModeAllSingle,
		// Pattern mockSample generation runs at the native defaults; it
		// works when the host installed the sidecar hook (the playground
		// loads it before this module) and degrades to FMT005 without it.
		PatternSampleCount:   constants.DefaultPatternSampleCount,
		PatternSampleRetries: constants.DefaultPatternSampleRetries,
	})

	dispatch := js.FuncOf(func(this js.Value, args []js.Value) (result any) {
		// A panic anywhere in the resolver must come back to the host as a
		// JSON error response, never as an unrecoverable wasm trap that
		// tears down the whole module.
		defer func() {
			if r := recover(); r != nil {
				result = errorResponseJSON(fmt.Sprintf("panic: %v", r))
			}
		}()

		if len(args) < 1 || args[0].Type() != js.TypeString {
			return errorResponseJSON("dispatch: expected a single JSON-string argument")
		}

		var request protocol.Request
		if err := json.Unmarshal([]byte(args[0].String()), &request); err != nil {
			return errorResponseJSON("dispatch: decode request: " + err.Error())
		}

		response := serverResolver.Dispatch(request)
		encoded, err := json.Marshal(response)
		if err != nil {
			return errorResponseJSON("dispatch: encode response: " + err.Error())
		}
		return string(encoded)
	})

	js.Global().Set("__tsRunTypesDispatch", dispatch)

	// Signal readiness to the host (a function it can await) and report the
	// embedded versions so the playground can show what it loaded.
	js.Global().Set("__tsRunTypesVersion", map[string]any{
		"version": constants.Version,
		"tsgo":    constants.TsgoVersion,
	}["version"])
	if ready := js.Global().Get("__tsRunTypesOnReady"); ready.Type() == js.TypeFunction {
		ready.Invoke(constants.Version, constants.TsgoVersion)
	}

	// Block forever: unblocking would let the Go runtime exit and free the
	// registered callback, leaving the host with a dead function.
	select {}
}

// errorResponseJSON renders a protocol.Response carrying only an error, so the
// host always receives the same shape whether the call succeeded or not.
func errorResponseJSON(message string) string {
	encoded, err := json.Marshal(protocol.Response{Error: message})
	if err != nil {
		// json.Marshal of a plain string field cannot realistically fail;
		// fall back to a hand-built object so the host still gets valid JSON.
		return `{"error":"failed to encode error response"}`
	}
	return string(encoded)
}
