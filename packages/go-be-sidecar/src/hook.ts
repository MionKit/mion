// WASM host hook: the browser playground (and the node playground tests)
// load this as a classic script BEFORE instantiating the resolver WASM.
// It installs the synchronous __tsRunTypesJsEngine global — request-line
// JSON in, response-line JSON out, the exact sidecar contract — so the
// WASM build's jsengine routes pattern validation AND generation through
// the same runJobs logic the native sidecar runs, with full parity
// (same seeds, same values). Without the hook the WASM engine falls back
// to host-RegExp validation only, and generation degrades to FMT005.
import {handleRequestLine} from './jobs.ts';

(globalThis as {__tsRunTypesJsEngine?: (line: string) => string}).__tsRunTypesJsEngine = handleRequestLine;
