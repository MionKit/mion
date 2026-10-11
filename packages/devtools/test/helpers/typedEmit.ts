// The emitMode 'ts' rules both the compile-CLI test and the typed-emit fuzz lane check: strip parity against
// emitMode 'both', and a type check under every strictness flag a consumer may set.
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import * as nodeModule from 'node:module';
import {spawnSync} from 'node:child_process';

const require = createRequire(import.meta.url);
const stripTypes = (nodeModule as unknown as {stripTypeScriptTypes: (code: string) => string}).stripTypeScriptTypes;

/** Every strictness flag a consumer may type-check generated modules with; `include` is filled per run. **/
export function strictestTsconfig(include: string[]): string {
  return JSON.stringify({
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      lib: ['ES2023', 'DOM'],
      types: [],
      noEmit: true,
      declaration: true,
      skipLibCheck: true,
      strict: true,
      noImplicitAny: true,
      exactOptionalPropertyTypes: true,
      noUncheckedIndexedAccess: true,
      noPropertyAccessFromIndexSignature: true,
      noUnusedLocals: true,
      noUnusedParameters: true,
      verbatimModuleSyntax: true,
      isolatedModules: true,
      isolatedDeclarations: true,
      erasableSyntaxOnly: true,
      allowImportingTsExtensions: true,
    },
    include,
  });
}

/** Runs tsc over `<dir>/tsconfig.strictest.json` (written for include), returning its output: empty when clean. **/
export function strictestTypeCheck(dir: string, include: string[]): string {
  fs.writeFileSync(path.join(dir, 'tsconfig.strictest.json'), strictestTsconfig(include));
  const tsc = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '-p', 'tsconfig.strictest.json'], {
    cwd: dir,
    encoding: 'utf8',
  });
  return (tsc.stdout + tsc.stderr).trim();
}

/** The JavaScript a typed module runs as: Node's type stripping, which keeps every position. **/
export function stripTypeScript(code: string): string {
  return stripTypes(code);
}

// Differences the two modes have by design, none of them logic: emitMode ts names `.ts` files, spells an absent
// tuple-head slot `undefined`, prefixes an unused parameter `_` and parenthesizes a lone arrow parameter to type it.
function normalize(code: string): string {
  // The `_` prefix goes before whitespace does, while a space still separates `const _x` into two tokens.
  return code
    .replace(/(?<![\w$])_([A-Za-z$])/g, '$1')
    .replace(/\s+/g, '')
    .replace(/\.ts'/g, ".js'")
    .replace(/=\[([^,]+),(undefined|\(\)=>\[[^\]]*\]|rtL|),(undefined|ini\d*|),/g, (head) => head.replaceAll('undefined', ''))
    .replace(/\(([A-Za-z_$][\w$]*)\)=>/g, '$1=>');
}

/** Null when the typed module minus its types IS the emitMode 'both' module, code string included. **/
export function stripParityViolation(name: string, typedModule: string, bothModule: string): string | null {
  const typed = normalize(stripTypeScript(typedModule));
  const both = normalize(bothModule);
  if (typed === both) return null;
  let at = 0;
  while (at < typed.length && typed[at] === both[at]) at++;
  return `${name}: stripped typed module differs from emitMode both at ${at}\n  ts:   …${typed.slice(at, at + 120)}\n  both: …${both.slice(at, at + 120)}`;
}

/** Null when a type module strips to nothing but its doc comment: types cost no runtime byte. **/
export function typeModuleViolation(name: string, typedModule: string): string | null {
  const left = stripTypeScript(typedModule)
    .replace(/\/\*\*.*?\*\//gs, '')
    .trim();
  return left === '' ? null : `${name}: a type module strips to runtime code: ${left.slice(0, 120)}`;
}
