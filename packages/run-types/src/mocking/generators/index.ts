// Mock generators by name: the built-ins, plus the ones a team registers with registerMockGenerator.
// mockFromGenerator draws a value that fits the format's lengths (a built-in throws when none can), then keeps it only if the format's other string
// rules (pattern, allowedChars, disallowedChars) accept it, so the mock always re-passes its own validator.

import type {CustomMockGenerators} from '../../formats/index.ts';
import type {BuiltinMockGenerators} from '../../go-generated/mockGeneratorMeta.generated.ts';
import type {StringParams} from '../../formats/string/stringFormats.ts';
import type {MockRandom} from '../mockRandom.ts';
import {stringParamsAccept} from '../stringParamsAccept.ts';
import {BUILTIN_GENERATORS} from './builtins.ts';
import type {GeneratorFn} from './types.ts';

export type {GeneratorContext, GeneratorFn} from './types.ts';

/** Draws before giving up on a format whose character rules keep rejecting the generated values. **/
const MAX_ATTEMPTS = 64;

const customGenerators = new Map<string, GeneratorFn>();

/** Registers a generator so a string format's `generator: name` mocks with it. Declare the name on
 *  CustomMockGenerators first. A built-in name, or a name registered twice, throws. **/
export function registerMockGenerator(customName: Extract<keyof CustomMockGenerators, string>, generator: GeneratorFn): void {
  const name: string = customName;
  if (isBuiltin(name)) throw new Error(`registerMockGenerator: \`${name}\` is a built-in generator; pick another name.`);
  if (customGenerators.has(name)) throw new Error(`registerMockGenerator: \`${name}\` is already registered.`);
  if (typeof generator !== 'function') throw new Error(`registerMockGenerator: \`${name}\` needs a function.`);
  customGenerators.set(name, generator);
}

/** A value from the named generator that the string format's own params accept. **/
export function mockFromGenerator(name: string, params: StringParams, random: MockRandom): string {
  const generator = isBuiltin(name) ? BUILTIN_GENERATORS[name] : customGenerators.get(name);
  if (!generator) {
    throw new Error(
      `Mock generator \`${name}\` is not registered; call registerMockGenerator('${name}', fn) before creating the mock.`
    );
  }
  const {lo, hi} = lengthBounds(params);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const value = generator({random, lo, hi, params});
    if (typeof value !== 'string') throw new Error(`Mock generator \`${name}\` returned a ${typeof value}, not a string.`);
    const accepted = stringParamsAccept(value, params as Record<string, unknown>, (key) => {
      throw new Error(`Mock generator \`${name}\`: no run-time test for the string param '${key}'.`);
    });
    if (accepted) return value;
  }
  throw new Error(
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
