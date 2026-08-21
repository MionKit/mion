// smoke-bun-preload — the shared minimal subset, loaded through Bun's RUNTIME
// plugin host with NO bundle step. See ../rt-preload.ts for why this app exists.
export {selfCheck} from '../../shared/src/minimal';
