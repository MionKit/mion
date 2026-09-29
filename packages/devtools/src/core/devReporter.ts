// What a dev server prints: only what breaks running code, once per session. An Error or RuntimeError prints
// once; Warning lines give way to one count line, since the editor shows them through the mion lint rules;
// Info never prints. The dev server never stops on a finding: the transform of a file with a fatal Error
// throws, which is what puts it in the browser overlay.

import path from 'node:path';
import {isDowngraded, NONE, type DowngradeSet} from './downgradeErrors.ts';
import {Level, type Diagnostic} from './protocol.ts';
import {formatTscDiagnostic} from './surface.ts';

export class DevReporter {
  // Errors already printed and still present; one that goes away is forgotten, so it prints again if it returns.
  private printed = new Set<string>();
  // The warnings the last count line covered, so a batch that brings no new one prints nothing.
  private warned = new Set<string>();

  constructor(
    private readonly print: (block: string) => void,
    private readonly cwd: () => string
  ) {}

  // update takes the COMPLETE current list (a whole-program generate), prints what is new and forgets what is gone.
  update(diagnostics: Diagnostic[], downgrade: DowngradeSet = NONE): void {
    const {errors, warnings} = this.split(diagnostics, downgrade);
    const lines = [...errors].filter(([key]) => !this.printed.has(key)).map(([, diagnostic]) => formatTscDiagnostic(diagnostic));
    const fresh = [...warnings.keys()].filter((key) => !this.warned.has(key)).length;
    this.printed = new Set(errors.keys());
    this.warned = new Set(warnings.keys());
    if (fresh > 0) lines.push(countLine(warnings.size, fresh));
    if (lines.length > 0) this.print(lines.join('\n'));
  }

  // add reports one transformed file's errors without forgetting the rest: the file may sit outside the program
  // the last update covered.
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

  // One finding is its code, args and place; the site is resolved so a relative and an absolute spelling match.
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
