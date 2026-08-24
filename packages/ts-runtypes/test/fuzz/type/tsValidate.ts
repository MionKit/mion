// In-process TypeScript validity check for the fuzz lanes. Generated types are
// fed through the resolver (tsgo), which is lenient and will still produce a
// RunType for a type that does NOT actually compile — so a "bug" found on an
// invalid type is a FALSE POSITIVE, not a pipeline bug. This typechecks the
// generated type's DECLARATIONS in isolation (no ts-runtypes marker imports /
// call sites — only the `type`/`interface` defs decide validity) with the
// repo's own `typescript` package, the same compiler the project trusts.
//
// The virtual file is anchored at the REAL package root, so the format
// preamble's relative `./src/...` imports (the shipped brands) resolve to the
// sources on disk — the same files the resolver harnesses overlay virtually.
import * as ts from 'typescript';
import path from 'node:path';
import {renderGenerated, type GeneratedType} from '../core/typeGen.ts';

const OPTIONS: ts.CompilerOptions = {
  strict: true,
  noEmit: true,
  target: ts.ScriptTarget.ES2022,
  lib: ['lib.es2022.d.ts'],
  // The fixtures import the shipped `src/**` sources with explicit `.ts`
  // specifiers, exactly as the resolver-lane fixtures do.
  module: ts.ModuleKind.ESNext,
  moduleResolution: ts.ModuleResolutionKind.Bundler,
  allowImportingTsExtensions: true,
  // Only the generated source's own diagnostics decide validity; skipping the
  // lib + declaration checks keeps this fast and focused.
  skipLibCheck: true,
};

// packages/ts-runtypes/__fuzz_typecheck__.ts — a sibling of src/.
const FILE = path.resolve(__dirname, '../../../__fuzz_typecheck__.ts');

/** Typecheck a standalone TypeScript source; returns the error messages
 *  (`TS####: …`), empty when it compiles clean. */
export function typecheckSource(source: string): string[] {
  const sourceFile = ts.createSourceFile(FILE, source, ts.ScriptTarget.ES2022, true);
  const defaultHost = ts.createCompilerHost(OPTIONS);
  const host: ts.CompilerHost = {
    ...defaultHost,
    getSourceFile: (name, langOrOpts, onError, shouldCreate) =>
      name === FILE ? sourceFile : defaultHost.getSourceFile(name, langOrOpts, onError, shouldCreate),
    fileExists: (name) => name === FILE || defaultHost.fileExists(name),
    readFile: (name) => (name === FILE ? source : defaultHost.readFile(name)),
  };
  const program = ts.createProgram([FILE], OPTIONS, host);
  return ts
    .getPreEmitDiagnostics(program)
    .filter((d) => d.category === ts.DiagnosticCategory.Error && (!d.file || d.file.fileName === FILE))
    .map((d) => `TS${d.code}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
}

/** Render a generated type's declarations (no marker imports / call sites) and
 *  typecheck them. Empty result = the generated type is valid TypeScript. */
export function typecheckGeneratedType(gen: GeneratedType): string[] {
  const {decls, rootExpr} = renderGenerated(gen);
  const source = `${decls}\ntype __FuzzRoot = ${rootExpr};\n`;
  return typecheckSource(source);
}

/** True when the generated type compiles clean. */
export function isValidTypeScript(gen: GeneratedType): boolean {
  return typecheckGeneratedType(gen).length === 0;
}
