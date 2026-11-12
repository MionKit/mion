// The generic extension surface of @mionjs/devtools: any op through the plugin's own resolver, the
// capabilities op, runtime-registered catalog entries, the lint worker's ext scan checks and probes, and the
// MionExtension hooks. Stub transports and a stub binary stand in for an extension binary; the real binary
// covers the public answers.
import {PassThrough} from 'node:stream';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type {UnpluginContextMeta} from 'unplugin';
import {afterAll, describe, expect, it} from 'vitest';
import {unplugin, type MionExtension, type MionExtensionContext} from '../src/core/unplugin.ts';
import {buildResolverArgs, ResolverClient, ResolverStreamClient} from '../src/core/resolver-client.ts';
import {catalogEntry, DIAGNOSTIC_CATALOG, registerCatalogEntries, renderHeadline} from '../src/core/diagnosticCatalog.ts';
import {Family, Level, Severity, type Capabilities, type Request, type Response} from '../src/core/protocol.ts';
import {needsResolverPass} from '../src/lint/prefilter.ts';
import {LintSession} from '../src/lint/session.ts';
import {BIN, hasBinary} from './helpers/inline.ts';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const MARKER_PKG = path.resolve(REPO_ROOT, 'packages/run-types');
const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) fs.rmSync(dir, {recursive: true, force: true});
});

function tempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

/** A client whose "binary" is `answer`, recording every request it sends. **/
function stubClient(answer: (request: Request) => Response): {client: ResolverStreamClient; sent: Request[]} {
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const sent: Request[] = [];
  let buffered = '';
  stdin.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8');
    let newline: number;
    while ((newline = buffered.indexOf('\n')) >= 0) {
      const request = JSON.parse(buffered.slice(0, newline)) as Request;
      buffered = buffered.slice(newline + 1);
      sent.push(request);
      stdout.write(JSON.stringify(answer(request)) + '\n');
    }
  });
  return {client: new ResolverStreamClient(stdin, stdout, () => {}), sent};
}

const NO_CAPABILITIES: Capabilities = {extensions: [], ops: [], scanChecks: [], diagnostics: []};

describe('ResolverConnection.request / capabilities', () => {
  it('sends any op unchanged, with its files and ext', async () => {
    const {client, sent} = stubClient((request) => (request.op === 'xOp' ? {ext: {echo: request.ext}} : {}));
    const response = await client.request('xOp', {files: ['a.ts'], ext: {flag: true}});
    expect(sent[0]).toEqual({op: 'xOp', files: ['a.ts'], ext: {flag: true}});
    expect(response.ext).toEqual({echo: {flag: true}});
    client.close();
  });

  it("turns a public binary's unknown op into the pro-binary hint, and keeps an extension binary's error", async () => {
    const unknown = (capabilities: Capabilities) => (request: Request) =>
      request.op === 'capabilities' ? {capabilities} : {error: `unknown op: ${request.op}`};
    const pub = stubClient(unknown(NO_CAPABILITIES));
    await expect(pub.client.request('xOp')).rejects.toThrow(
      '`xOp` needs the mion-pro binary (install @mionkit/pro-bin-compiler)'
    );
    pub.client.close();
    const pro = stubClient(unknown({...NO_CAPABILITIES, extensions: [{name: 'x', version: '1'}]}));
    await expect(pro.client.request('xOp')).rejects.toThrow(/^unknown op: xOp$/);
    pro.client.close();
  });

  it('fetches capabilities once, and reads a binary without the op as no extensions', async () => {
    const {client, sent} = stubClient(() => ({error: 'unknown op: capabilities'}));
    expect(await client.capabilities()).toEqual(NO_CAPABILITIES);
    expect(await client.capabilities()).toEqual(NO_CAPABILITIES);
    expect(sent).toHaveLength(1);
    client.close();
  });

  it.skipIf(!hasBinary())('the public binary answers capabilities empty', async () => {
    const client = new ResolverClient(BIN, REPO_ROOT, '', {serverMode: true});
    try {
      expect(await client.capabilities()).toEqual(NO_CAPABILITIES);
      await expect(client.request('noSuchOp')).rejects.toThrow('`noSuchOp` needs the mion-pro binary');
    } finally {
      client.close();
    }
  });

  it('appends extension serve flags last', () => {
    const args = buildResolverArgs('/cwd', '', {genDir: '/gen', extraArgs: ['--x-flag', 'v']});
    expect(args.slice(-2)).toEqual(['--x-flag', 'v']);
  });
});

describe('runtime catalog entries', () => {
  it('renders an advertised entry and lets a registered entry win over the generated one', () => {
    registerCatalogEntries([
      {
        code: 'internal-test-ext-code',
        family: 'marker',
        level: 'warning',
        headline: 'Found `{thing}` here.',
        slots: ['thing'],
        summary: 's',
      },
    ]);
    expect(renderHeadline('internal-test-ext-code', ['x'])).toBe('Found `x` here.');
    const generated = DIAGNOSTIC_CATALOG['validate-symbol-root']!;
    try {
      registerCatalogEntries([
        {code: 'validate-symbol-root', family: 'runtype', level: 'runtimeError', headline: 'Owned text.', summary: 's'},
      ]);
      expect(catalogEntry('validate-symbol-root')?.headline).toBe('Owned text.');
    } finally {
      registerCatalogEntries([
        {
          code: 'validate-symbol-root',
          family: generated.family,
          level: generated.level,
          headline: generated.headline,
          slots: generated.slots ? [...generated.slots] : undefined,
          summary: 's',
        },
      ]);
    }
  });
});

// A stub extension binary: advertises one scan check with a probe and its code, and reports that code only when the
// request switched the check on through `ext`.
const STUB_BINARY = `#!/usr/bin/env node
const readline = require('node:readline');
const lines = readline.createInterface({input: process.stdin});
lines.on('line', (line) => {
  const request = JSON.parse(line);
  let response = {};
  if (request.op === 'capabilities') {
    response = {capabilities: {extensions: [{name: 'stub', version: '1'}], ops: [], diagnostics: [
      {code: 'internal-test-stub-check', family: 'marker', level: 'warning', headline: 'Stub check fired on {file}.', slots: ['file'], summary: 's'},
    ], scanChecks: [{name: 'stubCheck', family: 'marker', probe: '^// stub-probe'}]}};
  } else if (request.op === 'setSources') {
    response = {ok: true};
  } else if (request.op === 'scanFiles') {
    const on = request.ext && request.ext.stubCheck === true;
    response = {diagnostics: on ? [{code: 'internal-test-stub-check', family: 2, severity: 2, level: 3, args: [request.files[0]],
      site: {filePath: request.files[0], startLine: 1, startCol: 1}}] : []};
  } else {
    response = {error: 'unknown op: ' + request.op};
  }
  process.stdout.write(JSON.stringify(response) + '\\n');
});
`;

describe('lint: advertised scan checks', () => {
  it('admits a probed file the built-in pre-filter skips, switches the check on, and renders its code', () => {
    const dir = tempDir('rt-ext-lint-');
    const binary = path.join(dir, 'stub-binary.cjs');
    fs.writeFileSync(binary, STUB_BINARY, {mode: 0o755});
    const text = '// stub-probe\nexport const plain = 1;\n';
    expect(needsResolverPass(text)).toBe(false);

    const session = new LintSession();
    try {
      const probes = session.probesSync({binary});
      expect(needsResolverPass(text, undefined, undefined, probes)).toBe(true);
      const outcome = session.lintFileSync(path.join(dir, 'plain.ts'), text, {binary});
      expect('diagnostics' in outcome && outcome.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
        'internal-test-stub-check',
      ]);
      expect(renderHeadline('internal-test-stub-check', ['plain.ts'])).toBe('Stub check fired on plain.ts.');
    } finally {
      session.dispose();
    }
  });
});

describe('MionExtension hooks', () => {
  const register = hasBinary() ? it : it.skip;

  function writeProject(root: string): void {
    fs.mkdirSync(path.join(root, 'src'), {recursive: true});
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, noEmit: true},
        include: ['src'],
      })
    );
    fs.writeFileSync(
      path.join(root, 'src/a.ts'),
      "import {getRunTypeId} from '@mionjs/run-types';\nexport const id = getRunTypeId<{a: number}>();\n"
    );
    fs.mkdirSync(path.join(root, 'node_modules/@mionjs'), {recursive: true});
    fs.symlinkSync(MARKER_PKG, path.join(root, 'node_modules/@mionjs/run-types'), 'dir');
  }

  type RawPlugin = {
    buildStart?: (this: unknown) => Promise<void>;
    buildEnd?: (this: unknown) => void;
    rtHotUpdate?: (ctx: unknown, updates: {file: string; content?: string}[]) => Promise<void>;
    vite?: {handleHotUpdate?: (this: unknown, ctx: unknown) => Promise<unknown>};
  };

  function rawPlugin(root: string, extensions: MionExtension[], downgradeErrors?: string[] | '*'): RawPlugin {
    const raw = unplugin.raw(
      {binary: BIN, cwd: root, tsconfig: 'tsconfig.json', genDir: '.mion', detachResolver: true, extensions, downgradeErrors},
      {framework: 'vite', versions: {}} as UnpluginContextMeta
    );
    return (Array.isArray(raw) ? raw[0] : raw) as RawPlugin;
  }

  register(
    'fires each hook at its site, on the plugin resolver',
    async () => {
      const root = tempDir('rt-ext-hooks-');
      writeProject(root);
      const calls: string[] = [];
      const warnings: string[] = [];
      let buildContext: MionExtensionContext | undefined;
      const probe: MionExtension = {
        name: 'probe',
        serveArgs: () => {
          calls.push('serveArgs');
          return [];
        },
        async buildStart(ctx) {
          buildContext = ctx;
          calls.push(`buildStart:${fs.existsSync(path.join(ctx.genDir, 'types'))}`);
          expect(await ctx.resolver.capabilities()).toEqual(NO_CAPABILITIES);
        },
        filesChanged: (_ctx, files) => {
          calls.push(`filesChanged:${files.map((file) => path.relative(root, file)).join(',')}`);
        },
        ignoreHotUpdate: (file) => {
          calls.push(`ignoreHotUpdate:${path.basename(file)}`);
          return file.endsWith('own.ts');
        },
      };
      const plugin = rawPlugin(root, [probe], ['validate-symbol-root']);
      const ctx = {
        warn: (message: unknown) => warnings.push(String(message)),
        error: (message: unknown) => {
          throw new Error(String(message));
        },
      };
      try {
        await plugin.buildStart?.call(ctx);
        expect(calls).toEqual(['serveArgs', 'buildStart:true']);
        expect(buildContext?.command).toBe('build');
        expect(buildContext?.downgradeListed('validate-symbol-root')).toBe(true);
        expect(buildContext?.downgradeListed('validate-function-root')).toBe(false);
        expect(buildContext?.catalogEntry('validate-symbol-root')?.level).toBe('runtimeError');

        buildContext!.report([
          {
            diagnostic: {
              code: 'validate-symbol-root',
              family: Family.RunType,
              severity: Severity.Error,
              level: Level.RuntimeError,
              args: ['symbol'],
              site: {filePath: path.join(root, 'src/a.ts'), startLine: 1, startCol: 1},
            },
            downgraded: true,
          },
        ]);
        expect(warnings.join('\n')).toContain('validate-symbol-root');

        const file = path.join(root, 'src/a.ts');
        await plugin.rtHotUpdate?.(ctx, [{file, content: fs.readFileSync(file, 'utf8')}]);
        expect(calls).toContain('filesChanged:src/a.ts');

        const own = await plugin.vite?.handleHotUpdate?.call(ctx, {file: path.join(root, 'src/own.ts'), read: async () => ''});
        expect(own).toEqual([]);
        expect(calls).toContain('ignoreHotUpdate:own.ts');
      } finally {
        plugin.buildEnd?.call(ctx);
      }

      const wildcard = rawPlugin(root, [{name: 'w', buildStart: (hookCtx) => void (buildContext = hookCtx)}], '*');
      try {
        await wildcard.buildStart?.call(ctx);
        expect(buildContext?.downgradeListed('anything-at-all')).toBe(true);
      } finally {
        wildcard.buildEnd?.call(ctx);
      }
    },
    120_000
  );
});
