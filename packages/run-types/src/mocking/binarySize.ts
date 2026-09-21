// Helpers for the `respectBinarySize` mock option: bound generated values against the binary cold-start estimate.
// Estimate side: createBinaryEncoderFn's `dynamic` strategy and internal/cachegen/typefunctions/binary_size_estimate.go.

import type {BinarySizingOptions, MockOptions} from './mockTypes.ts';
import type {MockRandom} from './mockRandom.ts';

// Mirror internal/constants/constants.go DefaultSize*; used only when binarySizingOptions omits the field.
const DEFAULT_SIZE_BIAS = 0.8;
const DEFAULT_SIZE_ITEMS = 100;
const DEFAULT_SIZE_STRING_BYTES = 32;
const DEFAULT_SIZE_MAX_BYTES = 64 * 1024;

// dataView.ts MAX_VARINT: every serString write reserves MAX_VARINT + 3*charLength (worst-case UTF-8).
const MAX_VARINT = 5;

export interface ResolvedSizing {
  bias: number;
  items: number;
  stringBytes: number;
  /** The cap the estimator clamps every estimate to. **/
  maxBytes: number;
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
    maxBytes: posInt(opts?.sizeMaxBytes, DEFAULT_SIZE_MAX_BYTES),
  };
}

/** Shortest payload whose serString reserve (MAX_VARINT + 3*length) exceeds `budgetBytes`, so a cold buffer must grow. **/
export function overBudgetLength(budgetBytes: number): number {
  return Math.max(1, Math.floor((budgetBytes - MAX_VARINT) / 3) + 1);
}

// ASCII only: one UTF-8 byte per char, so char length equals byte length (the estimate budgets bytes).
export const ASCII_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function randomAscii(length: number, random: MockRandom): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ASCII_CHARS[random.int(0, ASCII_CHARS.length - 1)];
  return out;
}

/** Mutate `mock` so plain generation fits the cold-start buffer WITHOUT resizing.
 *  Every bound comes from the per-write RESERVE high-water, not the wire size.
 *  Values the mock can't shrink (enum members, regexp / record keys) are covered in binary_size_estimate.go. **/
export function applyInBoundsSizing(mock: MockOptions): void {
  const {bias, items, stringBytes} = resolveSizing(mock.binarySizingOptions);
  mock.maxRandomItemsLength = items;
  // Reserve model and estimate both assume 1 UTF-8 byte per char, so char length must equal byte length.
  mock.stringCharSet = ASCII_CHARS;
  // content = the estimate's per-string content budget (varint(content)+content).
  const content = Math.round(bias * stringBytes);
  mock.maxRandomStringLength = Math.max(1, Math.floor((content + 1 - MAX_VARINT) / 3));
  mock.optionalProbability = bias >= 1 ? 1 : 0;
  // An unbranded bigint serialises its decimal string (reserve 5+3*digits) against a fixed 21-byte estimate, so |value| <= 9999.
  // Shared with numbers (always 8 bytes, range-independent), harmless there.
  mock.minNumber = -9999;
  mock.maxNumber = 9999;
  // The encoder writes source then flags as two serString calls, so each write's reserve must fit the stringBytes+4 estimate.
  // The `/a/` fallback is backstopped by the estimate's regexp floor of 8.
  const est = stringBytes + 4;
  const fits = (re: RegExp): boolean =>
    MAX_VARINT + 3 * re.source.length <= est &&
    (re.source.length < 128 ? 1 : 2) + re.source.length + MAX_VARINT + 3 * re.flags.length <= est;
  const regexpFit = (mock.regexpList ?? []).filter(fits);
  mock.regexpList = regexpFit.length ? regexpFit : [/a/];
}
