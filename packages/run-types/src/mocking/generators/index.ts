// A fitted value is kept only if every format rule accepts it, so the mock always re-passes its own validator.

import type {CustomMockGenerators} from '../../formats/index.ts';
import type {BuiltinMockGenerators} from '../../go-generated/builtinMockGenerators.generated.ts';
import type {StringParams} from '../../formats/string/stringFormats.ts';
import type {MockRandom} from '../mockRandom.ts';
import {stringParamsAccept} from '../stringParamsAccept.ts';
import {fitCandidates, fitContext} from './fit.ts';
import {BUILTIN_GENERATORS} from './builtins.ts';
import type {GeneratorFn} from './types.ts';

export type {GeneratorContext, GeneratorFn} from './types.ts';

/** Draws before giving up on a format whose character rules keep rejecting the generated values. **/
const MAX_ATTEMPTS = 64;

const customGenerators = new Map<string, GeneratorFn>();

/** Thrown when every draw failed the format; a union mock falls through to a sibling arm on it. **/
export class MockGeneratorExhaustedError extends Error {}

/** Declare the name on CustomMockGenerators first. A built-in name throws; registering a name again replaces it, so a
 *  reloaded setup module (Vite HMR, a shared test worker) can register again. **/
export function registerMockGenerator(customName: Extract<keyof CustomMockGenerators, string>, generator: GeneratorFn): void {
  const name: string = customName;
  if (isBuiltin(name)) throw new Error(`registerMockGenerator: \`${name}\` is a built-in generator; pick another name.`);
  if (typeof generator !== 'function') throw new Error(`registerMockGenerator: \`${name}\` needs a function.`);
  customGenerators.set(name, generator);
}

export function mockFromGenerator(name: string, params: StringParams, random: MockRandom): string {
  const generator = isBuiltin(name) ? BUILTIN_GENERATORS[name] : customGenerators.get(name);
  if (!generator) {
    throw new Error(
      `Mock generator \`${name}\` is not registered; call registerMockGenerator('${name}', fn) before creating the mock.`
    );
  }
  const {lo, hi} = lengthBounds(params);
  const draw = (bounds: {lo?: number; hi?: number}): string => {
    const value = generator({random, ...bounds, params});
    if (typeof value !== 'string') throw new Error(`Mock generator \`${name}\` returned a ${typeof value}, not a string.`);
    return value;
  };
  const accepts = (value: string): boolean =>
    stringParamsAccept(value, params as Record<string, unknown>, (key) => {
      throw new Error(`Mock generator \`${name}\`: no run-time test for the string param '${key}'.`);
    });
  const fit = fitContext(params, {lo, hi, random});
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    for (const candidate of fitCandidates(draw({lo, hi}), fit, () => draw({}))) {
      if (accepts(candidate)) return candidate;
    }
  }
  throw new MockGeneratorExhaustedError(
    `Mock generator \`${name}\`: ${MAX_ATTEMPTS} values failed the format's pattern, allowedChars or disallowedChars; ` +
      'relax them or drop the generator.'
  );
}

function isBuiltin(name: string): name is keyof BuiltinMockGenerators {
  return Object.prototype.hasOwnProperty.call(BUILTIN_GENERATORS, name);
}

function lengthBounds(params: StringParams): {lo?: number; hi?: number} {
  if (params.length !== undefined) return {lo: params.length, hi: params.length};
  return {lo: params.minLength, hi: params.maxLength};
}
