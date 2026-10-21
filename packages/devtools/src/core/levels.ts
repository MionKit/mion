// The `levels` setting: Info is hidden unless it is `'all'`, and hiding never changes a halt.
// Go twin: ts-go-runtypes/internal/diagnostics/levels.go.
import {Level, type Diagnostic} from './protocol.ts';

export const LEVELS_ALL = 'all';

// resolveShowInfo throws at the host boundary, so a typo fails loudly.
export function resolveShowInfo(value: unknown): boolean {
  if (value === undefined || value === '') return false;
  if (value === LEVELS_ALL) return true;
  throw new Error(`[@mionjs/devtools] invalid levels ${JSON.stringify(value)} — the only accepted value is '${LEVELS_ALL}'`);
}

const LOG_STYLE_GROUPED = 'grouped';
const LOG_STYLE_LINES = 'lines';

// The `logStyle` setting, unset groups; twin of ResolveLogStyle in ts-go-runtypes/internal/diagnostics/logstyle.go.
export function resolveGrouped(value: unknown): boolean {
  if (value === undefined || value === '' || value === LOG_STYLE_GROUPED) return true;
  if (value === LOG_STYLE_LINES) return false;
  throw new Error(
    `[@mionjs/devtools] invalid logStyle ${JSON.stringify(value)} — the accepted values are '${LOG_STYLE_GROUPED}' and '${LOG_STYLE_LINES}'`
  );
}

export function isShown(diagnostic: Diagnostic, showInfo: boolean): boolean {
  return showInfo || diagnostic.level !== Level.Info;
}
