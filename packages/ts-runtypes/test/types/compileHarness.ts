// Shared in-process TypeScript-compiler measurement core for the type-level
// instantiation-budget tests (DataOnly, SubstituteSelf, …).
//
// `makeMeasurer(preamble)` returns a `measure(snippet)` that compiles
// `preamble + snippet` through the real TypeScript compiler and reports the
// type-check errors plus the compiler's `Instantiations` / `Types` counts (the
// same numbers `tsc --extendedDiagnostics` prints). Asserting an absolute
// instantiation ceiling turns a recursion / exponential-blowup regression into a
// red test, and the number is data for tuning a type.
//
// Lib SourceFiles are parsed once and reused across calls (so per-case cost is
// dominated by the snippet); `netInstantiations` subtracts the constant
// empty-snippet baseline (preamble + lib) so the figure isolates the snippet's
// own cost. Compiled against `lib.es2023` ALONE — no DOM — to keep the baseline
// (and bind time) low; the preambles only name es2023 types (+ any locally
// declared stubs).

import * as ts from 'typescript';

/** The sentinel KEY symbols, declared for a SLICED preamble.
 *
 *  Harnesses here slice a `#region …-extract` block verbatim out of src, which
 *  leaves behind whatever that file imports — including the `unique symbol`
 *  keys the brands ride (src/runtypes/sentinelKeys.ts). Re-declaring them by the
 *  same NAMES is enough: the resolver matches a symbol-keyed property on its
 *  declaration name, and for a pure typecheck like this only the shape matters.
 *  Slicing is what keeps these harnesses measuring the REAL machinery rather
 *  than a copy of it, so supplying the few names a slice cannot carry is the
 *  price of that fidelity. **/
export const SENTINEL_KEYS_PREAMBLE = `
declare const __rtFormatName: unique symbol;
declare const __rtFormatParams: unique symbol;
declare const __rtFormatBrand: unique symbol;
declare const __rtNot: unique symbol;
declare const __rtContains: unique symbol;
declare const __rtPatternProps: unique symbol;
declare const __rtPropNames: unique symbol;
declare const __rtOneOf: unique symbol;
declare const __rtUnevaluated: unique symbol;
`;

export interface MeasureResult {
  /** Type-check + syntax errors, with line numbers rebased to the SNIPPET (the
   *  preamble offset removed) so messages point at the case's own code. **/
  errors: string[];
  /** Raw program instantiation count (preamble + lib baseline + the snippet). **/
  instantiations: number;
  /** Instantiations ATTRIBUTABLE TO THE SNIPPET — raw minus the constant
   *  empty-snippet baseline. The regression metric: it isolates the type's cost
   *  from lib/preamble noise, so a tight absolute ceiling is meaningful. **/
  netInstantiations: number;
  /** Compiler type count (secondary signal). **/
  types: number;
}

const COMPILER_OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2023,
  lib: ['lib.es2023.d.ts'],
  moduleDetection: ts.ModuleDetectionKind.Force, // each snippet is its own module
};

const DEFAULT_SNIPPET_FILE = '__measure_case__.ts';

/** Options for measurers that need to `import` real source modules (so the
 *  budget reflects the REAL type-check cost, not cheap stand-ins). `options`
 *  merges over the defaults — a real-import measurer adds bundler module
 *  resolution + the libs the imported graph needs; `snippetFile` must be an
 *  ABSOLUTE path inside the package so the snippet's relative imports resolve
 *  against the real source tree. Omit both for the self-contained default. **/
export interface MeasurerConfig {
  options?: ts.CompilerOptions;
  snippetFile?: string;
}

/** Build a `measure(snippet)` bound to a fixed `preamble`. Each measurer keeps
 *  its own cached host + lazily-computed baseline. **/
export function makeMeasurer(preamble: string, config: MeasurerConfig = {}): (snippet: string) => MeasureResult {
  const compilerOptions: ts.CompilerOptions = {...COMPILER_OPTIONS, ...config.options};
  const snippetFile = config.snippetFile ?? DEFAULT_SNIPPET_FILE;
  const preambleLines = preamble.split('\n').length - 1;
  const libCache = new Map<string, ts.SourceFile | undefined>();
  const baseHost = ts.createCompilerHost(compilerOptions, true);
  let currentSnippet = '';

  const host: ts.CompilerHost = {
    ...baseHost,
    getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate) {
      if (fileName === snippetFile) {
        return ts.createSourceFile(fileName, currentSnippet, languageVersionOrOptions, true);
      }
      if (libCache.has(fileName)) return libCache.get(fileName);
      const sf = baseHost.getSourceFile(fileName, languageVersionOrOptions, onError, shouldCreate);
      libCache.set(fileName, sf);
      return sf;
    },
    writeFile() {},
    fileExists: (fileName) => fileName === snippetFile || baseHost.fileExists(fileName),
    readFile: (fileName) => (fileName === snippetFile ? currentSnippet : baseHost.readFile(fileName)),
  };

  function raw(snippet: string): {errors: string[]; instantiations: number; types: number} {
    currentSnippet = `${preamble}${snippet}\n`;
    const program = ts.createProgram([snippetFile], compilerOptions, host);
    const diagnostics = [...program.getSyntacticDiagnostics(), ...program.getSemanticDiagnostics()];
    const errors = diagnostics.map((d) => {
      let where = '';
      if (d.file && d.start !== undefined) {
        const {line, character} = d.file.getLineAndCharacterOfPosition(d.start);
        where = `${Math.max(1, line + 1 - preambleLines)}:${character + 1} `;
      }
      return `TS${d.code} ${where}${ts.flattenDiagnosticMessageText(d.messageText, '\n')}`;
    });
    return {errors, instantiations: program.getInstantiationCount(), types: program.getTypeCount()};
  }

  let baseline = -1;
  return (snippet: string): MeasureResult => {
    if (baseline < 0) baseline = raw('').instantiations;
    const r = raw(snippet);
    return {errors: r.errors, instantiations: r.instantiations, netInstantiations: r.instantiations - baseline, types: r.types};
  };
}
