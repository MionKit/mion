// The built dist reads `URL` off `typeof globalThis`: it must compile with neither `dom` nor `@types/node`, and keep
// URL verbatim with either. Compiled against the BUILT dist by real tsc, like dataonlyTemporalPosture.

import {describe, it, expect} from 'vitest';
import * as ts from 'typescript';
import {existsSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '../../dist');
const TYPE_ROOTS = resolve(HERE, '../../../../node_modules/@types');

const PRELUDE = `import type {DataOnly, JSONShape} from '@mionjs/run-types';
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Expect<T extends true> = T;
`;

// Without a URL global: the projection still drops non-data members, nothing collapses to the identity.
const DROP_PROBE = `${PRELUDE}
interface Dirty {a: string; fn(): void; pending: Promise<number>}
type _drop = Expect<Equal<DataOnly<Dirty>, {a: string}>>;
`;

const KEEP_PROBE = `${PRELUDE}
import type {NativeUrl, NativeUrlHttp} from '@mionjs/run-types/formats';
type _keep = Expect<Equal<DataOnly<URL>, URL>>;
type _keepNested = Expect<Equal<DataOnly<{link: URL; name: string}>, {link: URL; name: string}>>;
type _wire = Expect<Equal<JSONShape<{link: URL}>, {link: string}>>;
const plain: NativeUrl<{maxLength: 200}> = new URL('https://example.com');
const http: NativeUrlHttp = new URL('https://example.com');
plain.href.toUpperCase();
http.pathname.toUpperCase();
`;

const PROBE_PATH = '/__url_posture_probe__.ts';

function compileProbe(probe: string, lib: string[], types: string[]): string[] {
  const options: ts.CompilerOptions = {
    strict: true,
    noEmit: true,
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    skipLibCheck: true,
    lib,
    types,
    typeRoots: [TYPE_ROOTS],
    paths: {
      '@mionjs/run-types': [resolve(DIST, 'index.d.ts')],
      '@mionjs/run-types/formats': [resolve(DIST, 'formats/index.d.ts')],
    },
  };
  const host = ts.createCompilerHost(options);
  const baseGetSourceFile = host.getSourceFile.bind(host);
  const baseFileExists = host.fileExists.bind(host);
  const baseReadFile = host.readFile.bind(host);
  host.getSourceFile = (fileName, languageVersion, ...rest) =>
    fileName === PROBE_PATH
      ? ts.createSourceFile(fileName, probe, languageVersion, true)
      : baseGetSourceFile(fileName, languageVersion, ...rest);
  host.fileExists = (fileName) => fileName === PROBE_PATH || baseFileExists(fileName);
  host.readFile = (fileName) => (fileName === PROBE_PATH ? probe : baseReadFile(fileName));
  const program = ts.createProgram([PROBE_PATH], options, host);
  return ts.getPreEmitDiagnostics(program).map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
    const where = diagnostic.file ? `${diagnostic.file.fileName}:${diagnostic.start}` : '';
    return `${where} TS${diagnostic.code}: ${message}`;
  });
}

describe('URL in DataOnly and the NativeUrl formats, in every lib posture (against the built dist)', () => {
  it('has the built dist to compile against', () => {
    expect(existsSync(resolve(DIST, 'index.d.ts')), `missing ${DIST} — run 'pnpm run check:builds'`).toBe(true);
  });

  it('without dom or @types/node: the dist compiles and DataOnly still projects', () => {
    expect(compileProbe(DROP_PROBE, ['lib.es2022.d.ts'], [])).toEqual([]);
  });

  it('with lib dom: URL is kept verbatim', () => {
    expect(compileProbe(KEEP_PROBE, ['lib.es2022.d.ts', 'lib.dom.d.ts'], [])).toEqual([]);
  });

  it('with @types/node only: URL is kept verbatim', () => {
    expect(compileProbe(KEEP_PROBE, ['lib.es2022.d.ts'], ['node'])).toEqual([]);
  });
});
