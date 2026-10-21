// A dev server prints only what breaks running code, once per session: Warnings collapse to one count line (the
// editor shows them), Info never prints. It never stops; a fatal Error throws from its file's transform into the overlay.

import path from 'node:path';
import {isDowngraded, NONE, type DowngradeSet} from './downgradeErrors.ts';
import {Level, type Diagnostic} from './protocol.ts';
import {entryOf, formatGrouped} from './groupedLog.ts';
import {formatTscDiagnostic} from './surface.ts';

export class DevReporter {
  // Printed errors still present; one that goes away prints again if it returns.
  private printed = new Set<string>();
  // Warnings the last count line covered, so a batch with no new one prints nothing.
  private warned = new Set<string>();
  // So a file's transform also throws the whole-program Errors the last update anchored there.
  private fatal = new Map<string, Diagnostic[]>();

  constructor(
    private readonly print: (block: string) => void,
    private readonly cwd: () => string,
    // Read per print: the tsconfig `logStyle` echo only arrives with the first generate.
    private readonly grouped: () => boolean
  ) {}

  // update takes the COMPLETE current list (a whole-program generate) and forgets what is gone.
  update(diagnostics: Diagnostic[], downgrade: DowngradeSet = NONE): void {
    const {errors, warnings} = this.split(diagnostics, downgrade);
    const lines = this.errorLines([...errors].filter(([key]) => !this.printed.has(key)).map(([, diagnostic]) => diagnostic));
    const fresh = [...warnings.keys()].filter((key) => !this.warned.has(key)).length;
    this.printed = new Set(errors.keys());
    this.warned = new Set(warnings.keys());
    this.fatal = new Map();
    for (const diagnostic of errors.values()) {
      if (diagnostic.level !== Level.Error) continue;
      const file = this.fileOf(diagnostic);
      this.fatal.set(file, [...(this.fatal.get(file) ?? []), diagnostic]);
    }
    if (fresh > 0) lines.push(countLine(warnings.size, fresh));
    if (lines.length > 0) this.print(lines.join('\n'));
  }

  // add forgets nothing: the file may sit outside the program the last update covered.
  add(diagnostics: Diagnostic[], downgrade: DowngradeSet = NONE): void {
    const {errors} = this.split(diagnostics, downgrade);
    const fresh: Diagnostic[] = [];
    for (const [key, diagnostic] of errors) {
      if (this.printed.has(key)) continue;
      this.printed.add(key);
      fresh.push(diagnostic);
    }
    const lines = this.errorLines(fresh);
    if (lines.length > 0) this.print(lines.join('\n'));
  }

  // fatalIn is what a transform of file throws: its own Errors plus those the last update anchored there.
  fatalIn(file: string, diagnostics: Diagnostic[]): Diagnostic[] {
    const own = diagnostics.filter((diagnostic) => diagnostic.level === Level.Error);
    const byKey = new Map(own.map((diagnostic) => [this.keyOf(diagnostic), diagnostic]));
    for (const diagnostic of this.fatal.get(path.resolve(this.cwd(), file)) ?? []) {
      if (!byKey.has(this.keyOf(diagnostic))) byKey.set(this.keyOf(diagnostic), diagnostic);
    }
    return [...byKey.values()];
  }

  private errorLines(errors: Diagnostic[]): string[] {
    if (errors.length === 0) return [];
    if (this.grouped())
      return [
        formatGrouped(
          errors.map((diagnostic) => entryOf(diagnostic, false)),
          this.cwd()
        ),
      ];
    return errors.map((diagnostic) => formatTscDiagnostic(diagnostic));
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
  private fileOf(diagnostic: Diagnostic): string {
    return diagnostic.site.filePath ? path.resolve(this.cwd(), diagnostic.site.filePath) : '';
  }

  private keyOf(diagnostic: Diagnostic): string {
    const {startLine, startCol} = diagnostic.site;
    return `${diagnostic.code}\u0000${(diagnostic.args ?? []).join('\u0000')}\u0000${this.fileOf(diagnostic)}:${startLine}:${startCol}`;
  }
}

function countLine(total: number, fresh: number): string {
  const noun = total === 1 ? 'warning' : 'warnings';
  return `mion: ${total} ${noun} (${fresh} new). Your editor shows them through the mion lint rules.`;
}
