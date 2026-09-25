// WASM host hook: loaded as a classic script BEFORE the resolver WASM is instantiated, it installs
// the synchronous __tsRunTypesJsEngine global so the WASM jsengine runs the same jobs as the native
// sidecar. Without it, WASM validates with the host RegExp only and generation degrades to FMT005.
import {handleRequestLine} from './jobs.ts';

(globalThis as {__tsRunTypesJsEngine?: (line: string) => string}).__tsRunTypesJsEngine = handleRequestLine;
