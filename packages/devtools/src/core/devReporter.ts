// A dev server prints only what breaks running code, once per session: Warnings collapse to one count line (the
// editor shows them), Info never prints. It never stops; a fatal Error's transform throws into the overlay.

import path from 'node:path';
import {isDowngraded, NONE, type DowngradeSet} from './downgradeErrors.ts';
import {Level, type Diagnostic} from './protocol.ts';
import {formatTscDiagnostic} from './surface.ts';

export class DevReporter {
  // Printed errors still present; one that goes away prints again if it returns.
  private printed = new Set<string>();
  // Warnings the last count line covered, so a batch with no new one prints nothing.
  private warned = new Set<string>();

  constructor(
    private readonly print: (block: string) => void,
    private readonly cwd: () => string
  ) {}

  // update takes the COMPLETE current list (a whole-program generate) and forgets what is gone.
  update(diagnostics: Diagnostic[], downgrade: DowngradeSet = NONE): void {
    const {errors, warnings} = this.split(diagnostics, downgrade);
    const lines = [...errors].filter(([key]) => !this.printed.has(key)).map(([, diagnostic]) => formatTscDiagnostic(diagnostic));
    const fresh = [...warnings.keys()].filter((key) => !this.warned.has(key)).length;
    this.printed = new Set(errors.keys());
    this.warned = new Set(warnings.keys());
    if (fresh > 0) lines.push(countLine(warnings.size, fresh));
    if (lines.length > 0) this.print(lines.join('\n'));
  }

  // add forgets nothing: the file may sit outside the program the last update covered.
  add(diagnostics: Diagnostic[], downgrade: DowngradeSet = NONE): void {
    const {errors} = this.split(diagnostics, downgrade);
    const lines: string[] = [];
    for (const [key, diagnostic] of errors) {
      if (this.printed.has(key)) continue;
      this.printed.add(key);
      lines.push(formatTscDiagnostic(diagnostic));
    }
    if (lines.length > 0) this.print(lines.join('\n'));
  }

  private split(diagnostics: Diagnostic[], downgrade: DowngradeSet) {
    const errors = new Map<string, Diagnostic>();
    const warnings = new Map<string, Diagnostic>();
    for (const diagnostic of diagnostics) {
      const key = this.keyOf(diagnostic);
      if (diagnostic.level === Level.Warning || isDowngraded(downgrade, diagnostic)) warnings.set(key, diagnostic);
      else if (diagnostic.level === Level.Error || diagnostic.level === Level.RuntimeError) errors.set(key, diagnostic);
    }
    return {errors, warnings};
  }

  // The site is resolved so a relative and an absolute spelling match.
  private keyOf(diagnostic: Diagnostic): string {
    const {filePath, startLine, startCol} = diagnostic.site;
    const file = filePath ? path.resolve(this.cwd(), filePath) : '';
    return `${diagnostic.code}\u0000${(diagnostic.args ?? []).join('\u0000')}\u0000${file}:${startLine}:${startCol}`;
  }
}

function countLine(total: number, fresh: number): string {
  const noun = total === 1 ? 'warning' : 'warnings';
  return `mion: ${total} ${noun} (${fresh} new). Your editor shows them through the mion lint rules.`;
}
