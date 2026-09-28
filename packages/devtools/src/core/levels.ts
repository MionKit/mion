// The `levels` setting: which diagnostic levels a host prints. Info (the documented behaviour, or advice) is
// hidden unless it is `'all'`; hiding never changes a halt, since an Info never halts. Go twin:
// ts-go-runtypes/internal/diagnostics/levels.go.
import {Level, type Diagnostic} from './protocol.ts';

export const LEVELS_ALL = 'all';

// resolveShowInfo validates a configured value at the host boundary, so a typo fails loudly.
export function resolveShowInfo(value: unknown): boolean {
  if (value === undefined || value === '') return false;
  if (value === LEVELS_ALL) return true;
  throw new Error(`[@mionjs/devtools] invalid levels ${JSON.stringify(value)} — the only accepted value is '${LEVELS_ALL}'`);
}

export function isShown(diagnostic: Diagnostic, showInfo: boolean): boolean {
  return showInfo || diagnostic.level !== Level.Info;
}
