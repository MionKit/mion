// Property fuzz for the credit-card checksum: over thousands of generated card
// numbers, changing ANY single digit must be rejected. That is the whole
// promise of the Luhn checksum and the reason the format exists — a digits and
// length check alone would accept every one of these mutants.
//
// Runs against the registered pure fn directly (that is where the logic lives),
// so it needs no Go binary and rides the fuzz UNIT lane.

import {describe, it, expect} from 'vitest';
import {getRTUtils} from '../../../src/runtypes/rtUtils.ts';
import '../../../src/formats/string/string-formats-pure-fns.ts';
import {withSeededRandom} from '../core/seededRng.ts';

interface CardParams {
  networks?: readonly string[];
  separators?: string;
}
// isCreditCard returns the FAILURE MODE ('' when valid); matchesCardNetwork is a
// plain boolean.
type CardModeFn = (value: string, params: CardParams) => string;
type CardFn = (value: string, params: CardParams) => boolean;

const isCreditCard = getRTUtils().getPureFn('rtFormats::isCreditCard') as CardModeFn;
const matchesCardNetwork = getRTUtils().getPureFn('rtFormats::matchesCardNetwork') as CardFn;

// The check digit is whatever makes the running Luhn sum land on a multiple of
// 10, so appending it turns any digit string into a valid card number.
function withCheckDigit(body: string): string {
  let sum = 0;
  let double = true;
  for (let i = body.length - 1; i >= 0; i--) {
    let digit = body.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return body + String((10 - (sum % 10)) % 10);
}

// A random card number of a random valid length, built from the given prefix.
function randomCard(prefix: string): string {
  const length = 12 + Math.floor(Math.random() * 8);
  let body = prefix;
  while (body.length < length - 1) body += String(Math.floor(Math.random() * 10));
  return withCheckDigit(body.slice(0, length - 1));
}

const SEED = 0x0dd1e;
const RUNS = 3000;

describe('fuzz / credit card — the Luhn checksum catches every single-digit change', () => {
  it('accepts every generated number and rejects every one-digit mutation of it', () => {
    withSeededRandom(SEED, () => {
      for (let run = 0; run < RUNS; run++) {
        const card = randomCard(String(1 + Math.floor(Math.random() * 9)));
        expect(isCreditCard(card, {}), `generated card ${card} should be valid`).toBe('');

        // Change one digit to a different one, anywhere in the number.
        const at = Math.floor(Math.random() * card.length);
        const original = card.charCodeAt(at) - 48;
        const replacement = (original + 1 + Math.floor(Math.random() * 9)) % 10;
        const mutant = card.slice(0, at) + String(replacement) + card.slice(at + 1);

        // 'checksum', not 'format': the mutant is still the right shape, which is
        // exactly the failure the checksum exists to catch.
        expect(isCreditCard(mutant, {}), `one-digit change ${card} → ${mutant} must be rejected`).toBe('checksum');
      }
    });
  });

  it('accepts the same numbers grouped when separators are declared, and rejects stray placements', () => {
    withSeededRandom(SEED + 1, () => {
      for (let run = 0; run < 500; run++) {
        const card = randomCard('4');
        // Group into random chunks, which is how a person types one in.
        let grouped = '';
        let index = 0;
        while (index < card.length) {
          const take = 1 + Math.floor(Math.random() * 4);
          if (grouped !== '') grouped += Math.random() < 0.5 ? ' ' : '-';
          grouped += card.slice(index, index + take);
          index += take;
        }
        expect(isCreditCard(grouped, {separators: ' -'}), `${grouped} should be valid`).toBe('');
        // A separator only ever sits between digits.
        expect(isCreditCard(' ' + grouped, {separators: ' -'})).toBe('format');
        expect(isCreditCard(grouped + ' ', {separators: ' -'})).toBe('format');
        // A separator the format did not declare stays rejected.
        expect(isCreditCard(grouped.replace(/[ -]/, '.'), {separators: ' -'})).toBe(
          grouped.search(/[ -]/) === -1 ? '' : 'format'
        );
      }
    });
  });

  it('a number the network check accepts always passes the base check too', () => {
    // The two pure fns have no dependency edge, so nothing structurally forces
    // them to agree. This pins the one direction that must hold: the network
    // table only ever names lengths the base check already allows.
    const networks = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'diners', 'unionpay', 'maestro'];
    const prefixes = ['4', '51', '2221', '34', '37', '6011', '65', '3528', '300', '36', '62', '6759'];
    withSeededRandom(SEED + 2, () => {
      for (let run = 0; run < 2000; run++) {
        const card = randomCard(prefixes[Math.floor(Math.random() * prefixes.length)]);
        if (!matchesCardNetwork(card, {networks})) continue;
        expect(isCreditCard(card, {}), `${card} matched a network but failed the base check`).toBe('');
      }
    });
  });
});
