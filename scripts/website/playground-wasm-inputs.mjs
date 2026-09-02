// Shared identity of the Go sources the playground WASM is compiled from.
//
// Two consumers deliberately share this one implementation, so they can never
// disagree about what "the wasm is out of date" means:
//   - container/website/scripts/build-playground.mjs stamps the digest beside
//     the wasm it just built, and rebuilds when the digest no longer matches.
//   - packages/run-types/test/playground/nodeResolver.ts re-computes it to
//     decide whether the cached wasm still matches the tree under test.
//
// The digest itself is scripts/lib/go-inputs.mjs, the same content digest the
// resolver binary's stamp uses (content, not mtimes: a copied cache reorders
// mtimes freely, a content digest cannot lie). This module only fixes the
// playground's input list; its bytes are unchanged by the move.

import {goInputsDigest, isGoInput, readStamp} from '../lib/go-inputs.mjs';

// Every Go input the wasm links, repo-relative.
export const WASM_INPUTS = ['ts-go-runtypes/cmd/mion-wasm', 'ts-go-runtypes/internal', 'ts-go-runtypes/go.mod', 'ts-go-runtypes/go.sum'];

// The test loader SKIPS on a mismatch, so the filter matters: an over-broad
// digest would drop the playground suites on any PR that touched a Go test,
// trading a loud failure for silent coverage loss.
export const isWasmInput = isGoInput;

export const wasmInputsDigest = (repoRoot) => goInputsDigest(repoRoot, WASM_INPUTS);

export const readWasmStamp = readStamp;
