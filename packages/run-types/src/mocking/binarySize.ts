// Shared helpers for the `respectBinarySize` mock option — bound generated
// values against the binary cold-start size estimate (see createBinaryEncoderFn's
// `dynamic` strategy and internal/cachegen/typefunctions/binary_size_estimate.go).

import type {BinarySizingOptions, MockOptions} from './mockTypes.ts';
import type {MockRandom} from './mockRandom.ts';

// Mirror internal/constants/constants.go DefaultSize* — only the fallbacks when
// binarySizingOptions omits a field (callers steering size pass them explicitly).
const DEFAULT_SIZE_BIAS = 0.8;
const DEFAULT_SIZE_ITEMS = 100;
const DEFAULT_SIZE_STRING_BYTES = 32;

// dataView.ts MAX_VARINT — every serString write reserves MAX_VARINT + charLength*3
// (worst-case UTF-8), the high-water the bounds below keep under the estimate.
const MAX_VARINT = 5;

export interface ResolvedSizing {
  bias: number;
  items: number;
  stringBytes: number;
}

function posInt(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && value > 0 ? Math.floor(value) : fallback;
}

export function resolveSizing(opts?: BinarySizingOptions): ResolvedSizing {
  const bias = Math.min(1, Math.max(0, opts?.sizeBias ?? DEFAULT_SIZE_BIAS));
  return {
    bias,
    items: posInt(opts?.sizeItems, DEFAULT_SIZE_ITEMS),
    stringBytes: posInt(opts?.sizeStringBytes, DEFAULT_SIZE_STRING_BYTES),
  };
}

// ASCII only — one UTF-8 byte per char, so a string's char length IS its byte
// length (the estimate budgets bytes).
export const ASCII_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomAscii(length: number, random: MockRandom): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ASCII_CHARS[random.int(0, ASCII_CHARS.length - 1)];
  return out;
}

/** Mutate `mock` so plain generation fits the cold-start buffer WITHOUT resizing.
 *  Every bound is derived from the per-write RESERVE high-water (serString reserves
 *  MAX_VARINT + 3*charLength), not the wire size — so a `respectBinarySize:true`
 *  value encodes through a buffer seeded at the estimate and never grows it.
 *  Type-constrained values the mock can't shrink (enum members, regexp / record
 *  keys) are covered on the estimate side (binary_size_estimate.go). **/
export function applyInBoundsSizing(mock: MockOptions): void {
  const {bias, items, stringBytes} = resolveSizing(mock.binarySizingOptions);
  mock.maxRandomItemsLength = items;
  // ASCII: the reserve model and the estimate both assume 1 UTF-8 byte per char,
  // so char length must equal byte length.
  mock.stringCharSet = ASCII_CHARS;
  // content = the estimate's per-string content budget (varint(content)+content).
  // The longest string whose 5+3*L reserve fits it is floor((content+1-MAX_VARINT)/3).
  const content = Math.round(bias * stringBytes);
  mock.maxRandomStringLength = Math.max(1, Math.floor((content + 1 - MAX_VARINT) / 3));
  mock.optionalProbability = bias >= 1 ? 1 : 0;
  // An unbranded bigint serialises its decimal string (reserve 5+3*digits) against
  // a fixed 21-byte estimate, so |value| <= 9999 ("-9999" => reserve 5+15=20 <= 21).
  // Shared with numbers (always 8 bytes, range-independent) — harmless there.
  mock.minNumber = -9999;
  mock.maxNumber = 9999;
  // The encoder writes source then flags as two serString calls; keep a regexp only
  // when each write's reserve fits the (stringBytes+4) estimate (the `/a/` floor is
  // backstopped by the estimate's regexp floor of 8).
  const est = stringBytes + 4;
  const fits = (re: RegExp): boolean =>
    MAX_VARINT + 3 * re.source.length <= est &&
    (re.source.length < 128 ? 1 : 2) + re.source.length + MAX_VARINT + 3 * re.flags.length <= est;
  const regexpFit = (mock.regexpList ?? []).filter(fits);
  mock.regexpList = regexpFit.length ? regexpFit : [/a/];
}
