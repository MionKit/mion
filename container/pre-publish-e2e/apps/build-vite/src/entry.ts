// build-vite — the HEAVY app: Vite on Rolldown (rolldown-vite) + oxlint runs the
// FULL feature matrix (imports the shared index → all 13 families). The build's
// RunTypes plugin transforms the shared source; the build-output tests then load
// this dist and run selfCheck().
export {selfCheck} from '../../shared/src/index';
// Re-exported so the caveat's createValidateFn marker survives tree-shaking (the
// lint transport test asserts its VL0xx diagnostic fires).
export {isWithHandler} from './caveat';
