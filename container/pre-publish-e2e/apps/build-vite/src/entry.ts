// The heavy app: Vite on Rolldown + oxlint over all 11 feature families; build-output tests run this dist's selfCheck().
export {selfCheck} from '../../shared/src/index';
// Re-exported so the caveat's createValidateFn marker survives tree-shaking (the
// lint transport test asserts its validate-* diagnostic fires).
export {isWithHandler} from './caveat';
