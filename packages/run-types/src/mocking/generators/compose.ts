// Builds a generated value to fit [lo, hi] code points: a value is a row of parts, and each part's length is chosen
// left to right among the lengths from which the remaining parts can still reach the bounds. So whenever any
// combination fits, one is returned, and every draw goes through the shared MockRandom.

import type {MockRandom} from '../mockRandom.ts';
import type {Part, Shapes} from './types.ts';

export type {Part} from './types.ts';

const DIGITS = '0123456789';

/** A fixed text, like a separator. **/
export function literalPart(text: string): Part {
  return {lengths: [text.length], chars: text, common: text, leading: text.charAt(0), count: () => 1, draw: () => text};
}

/** One entry of a list, uniform among the entries of the chosen length. ASCII lists only, so `.length` counts code points. **/
export function listPart(list: readonly string[]): Part {
  const byLength = new Map<number, string[]>();
  for (const entry of list) {
    const bucket = byLength.get(entry.length);
    if (bucket) bucket.push(entry);
    else byLength.set(entry.length, [entry]);
  }
  const lengths = [...byLength.keys()].sort((left, right) => left - right);
  const common = [...new Set(list[0])].filter((char) => list.every((entry) => entry.includes(char))).join('');
  return {
    lengths,
    chars: [...new Set(list.join(''))].join(''),
    common,
    leading: [...new Set(list.map((entry) => entry.charAt(0)))].join(''),
    count: (length) => byLength.get(length)?.length ?? 0,
    draw: (random, length) => {
      const bucket = byLength.get(length) as string[];
      return bucket[random.int(0, bucket.length - 1)];
    },
  };
}

/** A whole number with `minDigits` to `maxDigits` digits and no leading zero. **/
export function numberPart(minDigits: number, maxDigits: number): Part {
  const lengths: number[] = [];
  for (let digits = minDigits; digits <= maxDigits; digits++) lengths.push(digits);
  return {
    lengths,
    chars: DIGITS,
    common: '',
    leading: DIGITS.slice(1),
    count: (length) => 9 * 10 ** (length - 1),
    draw: (random, length) => String(random.int(length === 1 ? 1 : 10 ** (length - 1), 10 ** length - 1)),
  };
}

/** Exactly `digits` digits; `leadingZero: false` keeps the first one non-zero, as a national phone number reads. **/
export function digitsPart(digits: number, leadingZero = false): Part {
  return {
    lengths: [digits],
    chars: DIGITS,
    common: '',
    leading: leadingZero ? DIGITS : DIGITS.slice(1),
    count: () => (leadingZero ? 10 : 9) * 10 ** (digits - 1),
    draw: (random) => {
      let out = String(random.int(leadingZero ? 0 : 1, 9));
      while (out.length < digits) out += String(random.int(0, 9));
      return out;
    },
  };
}

/** Every character a value of any shape can contain, the ones every value contains, and the ones a value can start
 *  with, all sorted. **/
export function shapeChars(shapes: Shapes): {chars: string; required: string; leading: string} {
  const chars = new Set<string>();
  const leading = new Set<string>();
  let required: Set<string> | undefined;
  for (const shape of shapes) {
    for (const char of shape[0]?.leading ?? '') leading.add(char);
    const mustHave = new Set<string>();
    for (const part of shape) {
      for (const char of part.chars) chars.add(char);
      for (const char of part.common) mustHave.add(char);
    }
    required = required ? new Set([...required].filter((char) => mustHave.has(char))) : mustHave;
  }
  return {
    chars: [...chars].sort().join(''),
    required: [...(required ?? [])].sort().join(''),
    leading: [...leading].sort().join(''),
  };
}

/** Every total length the parts can make, ascending. **/
export function reachableLengths(parts: readonly Part[]): number[] {
  return [...suffixReach(parts)[0]].sort((left, right) => left - right);
}

/** True when some value of the parts fits [lo, hi]. **/
export function fits(parts: readonly Part[], lo: number, hi: number): boolean {
  return anyIn(suffixReach(parts)[0], lo, hi);
}

/** A value of the parts within [lo, hi], or undefined when none fits. Lengths are weighted by how many values they
 *  hold, so an unbounded draw is uniform over the whole list. **/
export function compose(parts: readonly Part[], random: MockRandom, lo = 0, hi = Infinity): string | undefined {
  const reach = suffixReach(parts);
  if (!anyIn(reach[0], lo, hi)) return undefined;
  let out = '';
  let used = 0;
  for (let index = 0; index < parts.length; index++) {
    const part = parts[index];
    const rest = reach[index + 1];
    const options: number[] = [];
    let total = 0;
    for (const length of part.lengths) {
      if (!anyIn(rest, lo - used - length, hi - used - length)) continue;
      options.push(length);
      total += part.count(length);
    }
    let roll = random.int(0, total - 1);
    let chosen = options[options.length - 1];
    for (const length of options) {
      roll -= part.count(length);
      if (roll < 0) {
        chosen = length;
        break;
      }
    }
    out += part.draw(random, chosen);
    used += chosen;
  }
  return out;
}

// Shapes are fixed arrays, so each one's reach is worked out once.
const reachCache = new WeakMap<readonly Part[], Set<number>[]>();

// reach[i] = every length parts[i..] can add up to; reach[parts.length] = {0}.
function suffixReach(parts: readonly Part[]): Set<number>[] {
  const cached = reachCache.get(parts);
  if (cached) return cached;
  const reach: Set<number>[] = Array.from({length: parts.length + 1}, () => new Set<number>());
  reach[parts.length] = new Set([0]);
  for (let index = parts.length - 1; index >= 0; index--) {
    const next = new Set<number>();
    for (const length of parts[index].lengths) for (const rest of reach[index + 1]) next.add(length + rest);
    reach[index] = next;
  }
  reachCache.set(parts, reach);
  return reach;
}

function anyIn(values: Set<number>, lo: number, hi: number): boolean {
  for (const value of values) if (value >= lo && value <= hi) return true;
  return false;
}
