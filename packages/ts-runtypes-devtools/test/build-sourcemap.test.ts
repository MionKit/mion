// End-to-end proof that the rewrite's source map survives Vite's composite
// map chain (our EditBuffer map -> Oxc's TS transform -> Rolldown
// bundling): in a real `vite build` with sourcemaps on, the emitted chunk
// must map each marker call site back to its ORIGINAL fixture line — i.e.
// the injected single-line import block and the spliced bindings displace
// nothing in the debugger's view. The fixture deliberately carries a
// multibyte em-dash before the call sites so byte->char conversion is
// exercised through the full pipeline, not just in the rewrite unit tests.

import {describe, expect, it} from 'vitest';
import {build, type Rollup} from 'vite';
import path from 'node:path';
import fs from 'node:fs';
import runtypes from '../src/vite.ts';
import {BIN, hasBinary} from './helpers/inline.ts';
import {decodeMappings, type MappingSegment} from './helpers/sourcemap.ts';

const PACKAGE_ROOT = path.resolve(__dirname, '../../ts-runtypes');
// Lives under the marker package's test/ tree so tsconfig.test.json puts the
// fixture in the Go resolver's Program (the plugin scans real program files).
const FIXTURE_DIR = path.join(PACKAGE_ROOT, 'test', 'tmp-build-sourcemap');

const FIXTURE = `import {getRunTypeId} from '@ts-runtypes/core';
// padding line with a multibyte em-dash — keeps byte/char conversion honest
export interface MapThing {
  mapProp: string;
}
export const staticId = getRunTypeId<MapThing>();
const sample = {mapProp: 'x'} as MapThing;
export const reflectedId = getRunTypeId(sample);
`;

// Run the whole composite-map proof in BOTH transform wire modes: 'edits' (the
// FE applies the edit list + generates the map) and 'go' (the resolver returns
// the finished file + map). Both must chain cleanly through Vite's map
// composition — the modes are byte-equal by construction (see
// transform-modes.test.ts), and this proves that survives a real build.
describe.each(['edits', 'go'] as const)('vite build / composite source map [transformMode=%s]', (mode) => {
  const register = hasBinary() ? it : it.skip;

  // One real build shared by both form assertions (the build is the slow
  // part; the paired tests decode the same chunk map).
  let buildOnce: Promise<{chunk: Rollup.OutputChunk; mappedLines: MappingSegment[][]; fixtureSourceIndex: number}> | null = null;
  const builtChunk = () => (buildOnce ??= runBuild());

  async function runBuild() {
    fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    fs.mkdirSync(FIXTURE_DIR, {recursive: true});
    fs.writeFileSync(path.join(FIXTURE_DIR, 'entry-map.ts'), FIXTURE);
    try {
      const result = (await build({
        root: PACKAGE_ROOT,
        logLevel: 'error',
        resolve: {conditions: ['source']},
        plugins: [
          runtypes({
            binary: BIN,
            cwd: PACKAGE_ROOT,
            // tsconfig.test.json is incremental:false → RT disk cache off.
            tsconfig: 'tsconfig.test.json',
            transformMode: mode,
            // Isolated output root so this nested build never shares (and
            // prunes) the marker package's own vitest `__runtypes/types` dir —
            // the two programs differ (this one adds entry-map.ts), so a shared
            // dir would race-delete the fixture's modules. Cleaned with FIXTURE_DIR.
            genDir: path.join(FIXTURE_DIR, '__runtypes'),
            // The marker package's test program deliberately contains
            // Error-severity types (alwaysThrow suites) — same opt-out as its
            // own vitest config.
            failOnError: false,
          }) as never,
        ],
        build: {
          write: false,
          minify: false,
          sourcemap: true,
          rollupOptions: {
            input: {map: path.join(FIXTURE_DIR, 'entry-map.ts')},
          },
        },
      })) as Rollup.RollupOutput;

      const chunk = result.output.find((o): o is Rollup.OutputChunk => o.type === 'chunk' && o.isEntry);
      if (!chunk) throw new Error('no entry chunk emitted');
      if (!chunk.map) throw new Error('entry chunk carries no source map');
      // The chunk bundles the fixture together with the marker runtime and
      // the virtual entry modules — locate the fixture among the sources by
      // its content (path spelling differs across Vite versions).
      const fixtureSourceIndex = (chunk.map.sourcesContent ?? []).findIndex((content) => content === FIXTURE);
      if (fixtureSourceIndex < 0) throw new Error('fixture source missing from chunk map sourcesContent');
      return {chunk, mappedLines: decodeMappings(chunk.map.mappings), fixtureSourceIndex};
    } finally {
      fs.rmSync(FIXTURE_DIR, {recursive: true, force: true});
    }
  }

  // expectMappedToOriginalLine asserts the composite map carries the marker
  // call back to the fixture line that wrote it. Vite app builds run the
  // bundler with `preserveEntrySignatures: false`, so the entry's exported
  // NAMES are dropped and only the side-effectful marker calls survive — the
  // assertion therefore keys on the surviving call expression
  // (`generatedToken`). Several generated lines can contain that token (the
  // marker package's own function definition bundles into the same chunk), so
  // the match requires a segment pointing at the FIXTURE source index AND the
  // expected line — definition/diagnostic lines map to other sources and can't
  // false-hit. NOTE: Rolldown (vite@8) inlines the single-use `const sample`
  // straight into the reflection call, so its generated form is
  // `getRunTypeId({ mapProp: "x" }, id)` — the reflection token keys on that
  // inlined shape, not the original `getRunTypeId(sample)` text.
  function expectMappedToOriginalLine(
    built: {chunk: Rollup.OutputChunk; mappedLines: MappingSegment[][]; fixtureSourceIndex: number},
    generatedToken: string,
    originalToken: string
  ) {
    const originalLine = FIXTURE.split('\n').findIndex((line) => line.includes(originalToken));
    expect(originalLine).toBeGreaterThanOrEqual(0);
    const generatedLines = built.chunk.code.split('\n');
    const candidates: number[] = [];
    for (let line = 0; line < generatedLines.length; line++) {
      if (generatedLines[line].includes(generatedToken)) candidates.push(line);
    }
    expect(candidates.length).toBeGreaterThan(0);
    const mapped = candidates.some((line) =>
      (built.mappedLines[line] ?? []).some(
        (segment) => segment.sourceIndex === built.fixtureSourceIndex && segment.originalLine === originalLine
      )
    );
    expect(mapped).toBe(true);
  }

  register(
    'static form: getRunTypeId<T>() site maps back to its original line',
    async () => {
      expectMappedToOriginalLine(await builtChunk(), 'getRunTypeId(', 'getRunTypeId<MapThing>');
    },
    120_000
  );

  register(
    'reflection form: getRunTypeId(value) site maps back to its original line',
    async () => {
      expectMappedToOriginalLine(await builtChunk(), 'getRunTypeId({', 'getRunTypeId(sample)');
    },
    120_000
  );
});
