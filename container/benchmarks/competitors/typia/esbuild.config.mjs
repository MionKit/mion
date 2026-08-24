// typia's MODERN tsgo build (replaces the legacy Vite + @ryoppippi/unplugin-typia
// path, which is archived and has no tsgo support).
//
// The project runs on tsgo (typescript-go / @typescript/native-preview), and
// typia's tsgo path is the `samchon/ttsc` toolchain: typia@next ships a Go-native
// transform that plugs into ttsc. Bundlers bypass the `ttsc` CLI, so we drive the
// same transform through `@ttsc/unplugin` — its esbuild adapter applies typia's
// tsgo transform during the esbuild pass, then esbuild bundles everything to ONE
// runnable `dist/run.mjs` (ESM, node22) that the bench runner executes directly.
//
// Plugin discovery: `@ttsc/unplugin` reads `compilerOptions.plugins` from the
// nearest tsconfig.json (here: `[{ transform: "typia/lib/transform" }]`), so the
// transform is wired through tsconfig.json — no extra config needed there.
//
// First build compiles typia's native plugin once via ttsc's OWN embedded Go
// toolchain (no system Go required) and caches it under node_modules/.ttsc/; every
// later build reuses that cache and is ~instant.
//
// ── Why the predicate-strip wrapper below ────────────────────────────────────
// typia's tsgo transform replaces `createIs<T>()` with an IIFE whose returned
// validator carries a TS type-predicate annotation, e.g. `(input): input is T =>`.
// That annotation is pure TYPE syntax (no runtime meaning) and `@ttsc/unplugin`
// hands it to esbuild with `loader: 'ts'` for esbuild to strip. esbuild's
// lightweight TS parser strips almost all of them — but it has a real gap: a
// predicate whose union contains a PARENTHESIZED arm (typia emits this for
// subset-related unions, e.g. `input is SmallObj | (LargeObj)`) makes esbuild
// throw `Unexpected ":"`. So we wrap the unplugin's onLoad and surgically remove
// the `: input is <type> =>` return annotations before esbuild parses; the
// runtime validator bodies are untouched.
import {build} from 'esbuild';
import ttscEsbuild from '@ttsc/unplugin/esbuild';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Remove TS return-type predicate annotations (": input is <TYPE> =>" -> " =>").
// Balanced scan past the type (respecting (), [], {}, <>, and string literals) up
// to the depth-0 "=>", so unions/generics/parenthesized arms are consumed whole.
export function stripReturnPredicates(code) {
  const needle = ': input is ';
  let out = '';
  let cursor = 0;
  while (cursor < code.length) {
    const at = code.indexOf(needle, cursor);
    if (at === -1) {
      out += code.slice(cursor);
      break;
    }
    out += code.slice(cursor, at);
    let scan = at + needle.length;
    let depth = 0;
    let stringDelim = null;
    while (scan < code.length) {
      const ch = code[scan];
      if (stringDelim) {
        if (ch === '\\') {
          scan += 2;
          continue;
        }
        if (ch === stringDelim) stringDelim = null;
        scan++;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        stringDelim = ch;
        scan++;
        continue;
      }
      if (ch === '(' || ch === '[' || ch === '{' || ch === '<') {
        depth++;
        scan++;
        continue;
      }
      if (ch === ')' || ch === ']' || ch === '}' || ch === '>') {
        depth--;
        scan++;
        continue;
      }
      if (depth === 0 && ch === '=' && code[scan + 1] === '>') break;
      scan++;
    }
    out += ' '; // collapse the stripped annotation to one space before "=>"
    cursor = scan;
  }
  return out;
}

// Wrap @ttsc/unplugin's esbuild adapter: run the typia transform, then strip the
// type-predicate annotations from whatever it returns so esbuild can parse it.
export const typiaTsgo = (tsconfig) => {
  // @ttsc/unplugin's option is `project` (the tsconfig whose program it compiles);
  // pointing it at a probe-including config puts the probe in the program so the
  // transform emits output for it (otherwise: "ttsc transform did not return output").
  const inner = ttscEsbuild(tsconfig ? {project: tsconfig} : undefined);
  return {
    name: 'typia-tsgo',
    setup(esbuildApi) {
      const registerOnLoad = esbuildApi.onLoad.bind(esbuildApi);
      esbuildApi.onLoad = (options, callback) =>
        registerOnLoad(options, async (args) => {
          const result = await callback(args);
          if (result && typeof result.contents === 'string' && result.contents.includes(': input is ')) {
            return {...result, contents: stripReturnPredicates(result.contents)};
          }
          return result;
        });
      return inner.setup(esbuildApi);
    },
  };
};

// Build ONE probe entry, in-memory (write: false) for timing — the compile-time
// benchmark imports this. `transform: false` builds WITHOUT the typia transform (plain
// esbuild bundle, the no-transform baseline); `project` points ttsc at a tsconfig whose
// program includes the probe (else the transform returns nothing for it).
export async function buildProbe(entry, project, {transform = true} = {}) {
  await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    minify: false,
    logLevel: 'silent',
    ...(project ? {tsconfig: project} : {}),
    plugins: transform ? [typiaTsgo(project)] : [],
  });
}

// The competitor's `build` script (`node esbuild.config.mjs`) bundles the suite to
// dist/run.mjs; importing this module (the benchmark) must NOT trigger that.
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  await build({
    entryPoints: [path.join(here, 'main.ts')],
    outfile: path.join(here, 'dist', 'run.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node22',
    minify: false,
    plugins: [typiaTsgo()],
  });
}
