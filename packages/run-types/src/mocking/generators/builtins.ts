// Built-ins named like drizzle-seed's; mockFromGenerator filters character and pattern rules afterwards.

import type {BuiltinMockGenerators} from '../../go-generated/mockGeneratorMeta.generated.ts';
import {compose, digitsPart, fits, listPart, literalPart, numberPart} from './compose.ts';
import type {GeneratorContext, GeneratorFn, Part, Shapes} from './types.ts';
import {FIRST_NAMES, LAST_NAMES} from './words/names.ts';
import {CITIES, COUNTRIES, STREET_SUFFIXES} from './words/places.ts';
import {COMPANY_SUFFIXES, EMAIL_ADJECTIVES, EMAIL_DOMAINS, JOB_TITLES, LOREM_WORDS} from './words/text.ts';

/** The most words a lorem sentence holds, so its longest form stays bounded. **/
const LOREM_MAX_WORDS = 40;
const LOREM_NATURAL_WORDS: readonly [number, number] = [4, 12];

const first = listPart(FIRST_NAMES);
const last = listPart(LAST_NAMES);
const space = literalPart(' ');
const loremWord = listPart(LOREM_WORDS);
const loremOpening = listPart(LOREM_WORDS.map((word) => word.charAt(0).toUpperCase() + word.slice(1)));

/** Every shape each built-in can produce; the metadata test derives the length and character table from these. **/
export const BUILTIN_SHAPES = {
  firstName: [[first]],
  lastName: [[last]],
  fullName: [[first, space, last]],
  email: [
    [
      listPart(EMAIL_ADJECTIVES),
      literalPart('_'),
      listPart(FIRST_NAMES.map((name) => name.toLowerCase())),
      literalPart('@'),
      listPart(EMAIL_DOMAINS),
    ],
  ],
  // One shape per country row, so the phone generators are uniform by country and agree on its calling code.
  phoneCountryCode: COUNTRIES.map((row) => [literalPart('+' + row.callingCode)]),
  phoneNumber: COUNTRIES.map((row) => [literalPart('+' + row.callingCode), digitsPart(row.nationalDigits)]),
  phoneNumberLocal: COUNTRIES.map((row) => [digitsPart(row.nationalDigits)]),
  country: [[listPart(COUNTRIES.map((row) => row.name))]],
  city: [[listPart(CITIES)]],
  state: COUNTRIES.flatMap((row) => (row.states ? [[listPart(row.states)]] : [])),
  streetAddress: [[numberPart(1, 4), space, listPart([...FIRST_NAMES, ...LAST_NAMES]), space, listPart(STREET_SUFFIXES)]],
  postcode: COUNTRIES.flatMap((row) => (row.postcodeTemplates ?? []).map(templateShape)),
  jobTitle: [[listPart(JOB_TITLES)]],
  companyName: [
    [last, space, listPart(COMPANY_SUFFIXES)],
    [last, literalPart(' - '), last],
    [last, literalPart(' and '), last],
    [last, literalPart(', '), last, literalPart(' and '), last],
  ],
  loremIpsum: Array.from({length: LOREM_MAX_WORDS}, (_, index) => loremShape(index + 1)),
} satisfies Record<keyof BuiltinMockGenerators, Shapes>;

export const BUILTIN_GENERATORS: Record<keyof BuiltinMockGenerators, GeneratorFn> = {
  ...(Object.fromEntries(
    Object.entries(BUILTIN_SHAPES).map(([name, shapes]) => [name, (ctx: GeneratorContext) => pickShape(name, shapes, ctx)])
  ) as Record<keyof BuiltinMockGenerators, GeneratorFn>),
  loremIpsum,
};

function pickShape(name: string, shapes: Shapes, ctx: GeneratorContext): string {
  const lo = ctx.lo ?? 0;
  const hi = ctx.hi ?? Infinity;
  const feasible = shapes.filter((shape) => fits(shape, lo, hi));
  if (feasible.length === 0) throw new Error(`Mock generator \`${name}\`: no value fits ${lo}..${hi} characters.`);
  return compose(feasible[ctx.random.int(0, feasible.length - 1)], ctx.random, lo, hi) as string;
}

// The natural word count when it fits, else the nearest count that does, so a plain draw reads like a sentence.
function loremIpsum(ctx: GeneratorContext): string {
  const lo = ctx.lo ?? 0;
  const hi = ctx.hi ?? Infinity;
  const natural = ctx.random.int(LOREM_NATURAL_WORDS[0], LOREM_NATURAL_WORDS[1]);
  let best: readonly Part[] | undefined;
  let bestDistance = Infinity;
  BUILTIN_SHAPES.loremIpsum.forEach((shape, index) => {
    const distance = Math.abs(index + 1 - natural);
    if (distance < bestDistance && fits(shape, lo, hi)) {
      best = shape;
      bestDistance = distance;
    }
  });
  if (!best) throw new Error(`Mock generator \`loremIpsum\`: no sentence fits ${lo}..${hi} characters.`);
  return compose(best, ctx.random, lo, hi) as string;
}

function loremShape(words: number): Part[] {
  const parts: Part[] = [loremOpening];
  for (let index = 1; index < words; index++) parts.push(space, loremWord);
  parts.push(literalPart('.'));
  return parts;
}

/** `#` is one digit, anything else is literal. **/
function templateShape(template: string): Part[] {
  return template.split(/(#+)/).flatMap((chunk) => {
    if (chunk === '') return [];
    return chunk.startsWith('#') ? [digitsPart(chunk.length, true)] : [literalPart(chunk)];
  });
}
