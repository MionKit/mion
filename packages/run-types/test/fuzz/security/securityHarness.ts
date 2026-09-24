// Security-lane compile harness: one random SERIALISABLE type → the factories the attack lanes need, through the
// roundtrip harness's compile path. It also returns the raw entry-module text for the generated-code lane.

import {createValidateFn, createJsonEncoderFn, createRemoveUnknownKeysFn} from '@mionjs/run-types';
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
  /** The rendered entry modules, verbatim. **/
  entryModules: Record<string, string>;
  validate?: (value: unknown) => boolean;
  jsonEncode?: (value: unknown) => string | undefined;
  /** The encoders that rebuild an object from its keys (clone / compact), for the prototype oracle over decoded values. **/
  jsonEncoders: Record<string, (value: unknown) => string | undefined>;
  /** The exact-shape clone, another key-driven rebuild. **/
  clone?: (value: unknown) => unknown;
  /** clone / mutate / compact decoders that wired. **/
  decoders: Record<string, (text: string) => unknown>;
  wireErrors: Record<string, string>;
}

export function renderSecurityFixture(gen: GeneratedType): string {
  const {decls, rootExpr} = renderGenerated(gen);
  return `import {
  createValidateFn,
  createJsonEncoderFn,
  createJsonDecoderFn,
  createRemoveUnknownKeysFn,
} from '@mionjs/run-types';
${decls}
type T = ${rootExpr};
createValidateFn<T>();
createJsonEncoderFn<T>(undefined, {strategy: 'clone'});
createJsonEncoderFn<T>(undefined, {strategy: 'compact'});
createRemoveUnknownKeysFn<T>();
createJsonDecoderFn<T>(undefined, {strategy: 'clone'});
createJsonDecoderFn<T>(undefined, {strategy: 'mutate'});
createJsonDecoderFn<T>(undefined, {strategy: 'compact'});
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
    ['clone', 'jeCL'],
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
    byTag.ruk ? (createRemoveUnknownKeysFn(undefined, byTag.ruk as never) as (v: unknown) => unknown) : undefined
  );
  const decoders: CompiledSecurity['decoders'] = {};
  for (const [name, tag] of [
    ['clone', 'jdCL'],
    ['mutate', 'jdMU'],
    ['compact', 'jdCO'],
  ] as const) {
    const decode = wireDecoder(byTag[tag]);
    if (decode) decoders[name] = decode as (text: string) => unknown;
  }
  return {
    ...partial,
    validate,
    jsonEncode,
    jsonEncoders,
    clone,
    decoders,
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
