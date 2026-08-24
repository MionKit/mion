// smoke-esbuild — LIGHT smoke: the esbuild adapter builds the shared MINIMAL
// subset (validate + reflection + one JSON round-trip). Also carries the ESLint
// lint transport (so both linters are exercised end-to-end).
export {selfCheck} from '../../shared/src/minimal';
export {isWithHandler} from './caveat';
