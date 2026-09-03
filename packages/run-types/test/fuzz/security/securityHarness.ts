// Security-lane compile harness: one random SERIALISABLE type → every factory
// the attack lanes need, wired from the resolver's entry modules, plus the raw
// entry-module text so the binary lane can rebuild the same factories inside
// its heap-capped worker thread.
//
// Reuses the roundtrip harness's compile path (resolver client, `SRC_OVERLAY`,
// tuple classification by family tag) with its own fixture: validate, the
// clone encoder, the three JSON decoder strategies, `parse`, and the binary
// encoder + decoder.

import {
  createValidateFn,
  createJsonEncoderFn,
  createParseFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createCloneExactShapeFn,
} from '@mionjs/run-types';
import {ResolverClient} from '../../../../devtools/src/core/resolver-client.ts';
import {MARKER_PACKAGE_OVERLAY, evalEntryModules, instantiateRunTypes} from '../../../../devtools/test/helpers/inline.ts';
import {Severity, type Diagnostic} from '../../../../devtools/src/core/protocol.ts';
import {renderGenerated, describeType, type GeneratedType} from '../core/typeGen.ts';
import {openClient, hasBinary, BIN, SRC_OVERLAY} from '../type/typeFuzzHarness.ts';
import {classifyByTag, wireDecoder, errMsg} from '../roundtrip/roundtripHarness.ts';

export {hasBinary, BIN, openClient};

const FIXTURE = 'g.ts';

export interface CompiledSecurity {
  gen: GeneratedType;
  title: string;
  source: string;
  diagnostics: Diagnostic[];
  errorDiagnostics: Diagnostic[];
  resolverError?: string;
  evalError?: string;
  /** The rendered entry modules, verbatim, for the worker thread. **/
  entryModules: Record<string, string>;
  /** Family tag → entry-module basename of the ROOT call site's tuple. The
   *  modules also carry one tuple per nested type (its own `fb`, `tb`, …), so
   *  a consumer must not pick a family by tag alone. **/
  rootKeys: Record<string, string>;
  validate?: (value: unknown) => boolean;
  jsonEncode?: (value: unknown) => string | undefined;
  /** The encoders that rebuild an object from its keys (safe / direct /
   *  compact), for the prototype oracle over decoded values. **/
  jsonEncoders: Record<string, (value: unknown) => string | undefined>;
  /** The exact-shape clone, another key-driven rebuild. **/
  clone?: (value: unknown) => unknown;
  parse?: (value: unknown) => unknown;
  /** strip / preserve / compact decoders that wired. **/
  decoders: Record<string, (text: string) => unknown>;
  binaryEncode?: (value: unknown) => Uint8Array;
  binaryDecode?: (input: unknown) => unknown;
  wireErrors: Record<string, string>;
}

export function renderSecurityFixture(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen);
  return `import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createParseFn,
  createBinaryEncoderFn,
  createBinaryDecoderFn,
  createCloneExactShapeFn,
} from '@mionjs/run-types';
${decls}
type T = ${rootExpr};
createValidateFn<T>();
createJsonEncoderFn<T>(undefined, {strategy: 'clone'});
createJsonEncoderFn<T>(undefined, {strategy: 'direct'});
createJsonEncoderFn<T>(undefined, {strategy: 'compact'});
createCloneExactShapeFn<T>();
createJsonDecoderFn<T>(undefined, {strategy: 'strip'});
createJsonDecoderFn<T>(undefined, {strategy: 'preserve'});
createJsonDecoderFn<T>(undefined, {strategy: 'compact'});
createParseFn<T>();
createBinaryEncoderFn<T>();
createBinaryDecoderFn<T>();
`;
}

/** Compile one generated type. Never throws; every failure lands on the result. **/
export async function compileSecurity(client: ResolverClient, gen: GeneratedType): Promise<CompiledSecurity> {
  const source = renderSecurityFixture(gen);
  const base: CompiledSecurity = {
    gen,
    title: describeType(gen),
    source,
    diagnostics: [],
    errorDiagnostics: [],
    entryModules: {},
    rootKeys: {},
    jsonEncoders: {},
    decoders: {},
    wireErrors: {},
  };
  let resp;
  try {
    await client.setSources({...SRC_OVERLAY, ...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
    resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
  } catch (err) {
    return {...base, resolverError: errMsg(err)};
  }
  const diagnostics = resp.diagnostics ?? [];
  const sites = (resp.sites ?? []).filter((site) => site.fnId);
  const entryModules = resp.entryModules ?? {};
  const partial: CompiledSecurity = {
    ...base,
    diagnostics,
    errorDiagnostics: diagnostics.filter((d) => d.severity === Severity.Error),
    entryModules,
  };
  let tuples: Record<string, readonly unknown[]>;
  try {
    tuples = evalEntryModules(entryModules);
    instantiateRunTypes(tuples);
  } catch (err) {
    return {...partial, evalError: errMsg(err)};
  }
  const byTag = classifyByTag(sites, tuples);
  const rootKeys: Record<string, string> = {};
  for (const site of sites) {
    const key = `${site.fnId}_${site.id}`;
    const tag = tuples[key]?.[0];
    if (typeof tag === 'string') rootKeys[tag] = key;
  }
  const wireErrors: Record<string, string> = {};
  const attempt = <R>(key: string, build: () => R | undefined): R | undefined => {
    try {
      return build();
    } catch (err) {
      wireErrors[key] = errMsg(err);
      return undefined;
    }
  };
  const validate = attempt('validate', () =>
    byTag.val ? (createValidateFn(undefined, undefined, byTag.val as never) as (v: unknown) => boolean) : undefined
  );
  const jsonEncode = attempt('jsonEncode', () =>
    byTag.jeCL
      ? (createJsonEncoderFn(undefined, undefined, byTag.jeCL as never) as (v: unknown) => string | undefined)
      : undefined
  );
  const jsonEncoders: CompiledSecurity['jsonEncoders'] = {};
  for (const [name, tag] of [
    ['safe', 'jeCL'],
    ['direct', 'jeDI'],
    ['compact', 'jeCO'],
  ] as const) {
    const encode = attempt(`encode:${name}`, () =>
      byTag[tag]
        ? (createJsonEncoderFn(undefined, undefined, byTag[tag] as never) as (v: unknown) => string | undefined)
        : undefined
    );
    if (encode) jsonEncoders[name] = encode;
  }
  const clone = attempt('clone', () =>
    byTag.ces ? (createCloneExactShapeFn(undefined, undefined, byTag.ces as never) as (v: unknown) => unknown) : undefined
  );
  const decoders: CompiledSecurity['decoders'] = {};
  for (const [name, tag] of [
    ['strip', 'jdST'],
    ['preserve', 'jdPR'],
    ['compact', 'jdCO'],
  ] as const) {
    const decode = wireDecoder(byTag[tag]);
    if (decode) decoders[name] = decode as (text: string) => unknown;
  }
  // The parse family tag depends on the strategy ('prs' strip, 'prsf' fail,
  // 'prss' preserve); the fixture uses the default, but accept any.
  const prs = byTag.prs ?? byTag.prss ?? byTag.prsf;
  const parse = attempt('parse', () =>
    prs && byTag.verr ? (createParseFn(undefined, undefined, [prs, byTag.verr] as never) as (v: unknown) => unknown) : undefined
  );
  const binaryEncode = attempt('binaryEncode', () =>
    byTag.tb ? (createBinaryEncoderFn(undefined, undefined, byTag.tb as never) as (v: unknown) => Uint8Array) : undefined
  );
  const binaryDecode = attempt('binaryDecode', () =>
    byTag.fb ? (createBinaryDecoderFn(undefined, undefined, byTag.fb as never) as (input: unknown) => unknown) : undefined
  );
  return {
    ...partial,
    rootKeys,
    validate,
    jsonEncode,
    jsonEncoders,
    clone,
    parse,
    decoders,
    binaryEncode,
    binaryDecode,
    wireErrors,
  };
}

/** Compile a single validate site for an arbitrary type expression (the
 *  format lane). `decls` may carry the TF import preamble. **/
export async function compileValidateOnly(
  client: ResolverClient,
  decls: string,
  typeText: string
): Promise<{validate?: (value: unknown) => boolean; error?: string}> {
  const source = `import {createValidateFn} from '@mionjs/run-types';\n${decls}\ntype T = ${typeText};\ncreateValidateFn<T>();\n`;
  try {
    await client.setSources({...SRC_OVERLAY, ...MARKER_PACKAGE_OVERLAY, [FIXTURE]: source});
    const resp = await client.scanFiles([FIXTURE], {includeEntryModules: true});
    const errors = (resp.diagnostics ?? []).filter((d) => d.severity === Severity.Error);
    if (errors.length > 0) return {error: errors.map((d) => `${d.code}${d.args ? ' ' + d.args.join(' ') : ''}`).join('; ')};
    const tuples = evalEntryModules(resp.entryModules ?? {});
    instantiateRunTypes(tuples);
    const byTag = classifyByTag(
      (resp.sites ?? []).filter((site) => site.fnId),
      tuples
    );
    if (!byTag.val) return {error: 'no validate site resolved'};
    return {validate: createValidateFn(undefined, undefined, byTag.val as never) as (v: unknown) => boolean};
  } catch (err) {
    return {error: errMsg(err)};
  }
}
