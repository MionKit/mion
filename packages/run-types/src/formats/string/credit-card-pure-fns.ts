// Registration module for the credit-card format's pure fns — split out of
// string-formats-pure-fns.ts because the card format carries more machinery than
// any other string format: three registrations plus a data table, and the two
// doors ordinary code uses to reach them.
//
// Imported for its side effect from `src/formats/index.ts`, exactly like its
// sibling, so the registrations happen before any user code references the
// format.
//
// The Go emitter records this path as the pure fns' canonical source
// (creditCardPureFnFilePath in
// internal/cachegen/typefunctions/formats/string/creditcard.go) — keep the two
// in sync if either moves.

import {registerPureFnFactory} from '../../runtypes/pureFn.ts';
import {getRTUtils} from '../../runtypes/rtUtils.ts';
import type {RTUtils} from '../../runtypes/rtUtils.ts';

// Split in TWO on purpose, with NO `utl.getPureFn` edge between them: the Go
// emitter references `matchesCardNetwork` only when the format declares
// `networks`, so a bare `CreditCard` never drags the network table into the
// emitted cache. A dependency edge would defeat that — the extractor records
// transitive deps and would ship both bodies to every call site.
//
//   isCreditCard        digits + length + the Luhn checksum
//   matchesCardNetwork  the per-network prefix / length table
//
// The price of the independence is that each strips `separators` itself. That
// is a handful of bytes against a table of every card network.

// CreditCardParams — the wire-shape params object the Go emitter passes at
// runtime. Mirrors CreditCardParams in ./stringFormats.ts, keeping only what
// the validators read.
interface CreditCardParams {
  networks?: readonly string[];
  separators?: string;
}

/** One network's issuing rules: the first-digit RANGES it uses (both bounds of a
 *  range carry the same number of digits) and the card lengths it issues. **/
export interface CardNetworkRule {
  prefixes: readonly (readonly [string, string])[];
  lengths: readonly number[];
}
/** The whole table, keyed by network name. Exported so the mock generator can
 *  type its `getPureFn('rtFormats::cardNetworkRules')` lookup — the VALUE stays
 *  the pure fn's, so there is exactly one copy. **/
export type CardNetworkRules = Readonly<Record<string, CardNetworkRule>>;

// pf_luhnSum — the Luhn doubling rule, in ONE place. Doubles every second digit
// counting back from the last, subtracting 9 when a double goes over 9, and
// skips anything that is not a digit so a grouped number sums like a bare one.
//
// Shared by the two jobs that would otherwise each spell it out: the VALIDATOR
// asks whether the sum is a multiple of 10, and the MOCK GENERATOR asks which
// final digit would make it one. Two copies of a doubling loop is exactly the
// kind of thing that drifts.
registerPureFnFactory('rtFormats::luhnSum', function () {
  return function _luhn_sum(value: string): number {
    let sum = 0;
    let double = false;
    for (let i = value.length - 1; i >= 0; i--) {
      const charCode = value.charCodeAt(i);
      if (charCode < 48 || charCode > 57) continue;
      let digit = charCode - 48;
      if (double) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      double = !double;
    }
    return sum;
  };
});

// pf_isCreditCard — the base card-number check. A card number is 12 to 19
// digits whose Luhn checksum comes out to a multiple of 10, which is what
// catches a mistyped digit; a plain length + character-class test does not.
//
// Returns the FAILURE MODE rather than a boolean: '' when the value is a good
// card number, 'format' when it is not shaped like one at all, 'checksum' when
// it is but the check digit does not add up. That feeds the `type` field of the
// emitted format error, so a caller can tell "that is not a card number" from
// "check the digits you typed". Validate compares against '' and pays nothing
// for it.
//
// The walk here settles SHAPE only (separator placement, digit count); the
// checksum is pf_luhnSum's, shared with the mock generator. Two short passes
// over at most 19 characters, and neither allocates.
registerPureFnFactory('rtFormats::isCreditCard', function (utl: RTUtils) {
  const luhnSum = utl.getPureFn('rtFormats::luhnSum') as (value: string) => number;
  return function _is_credit_card(value: string, params: CreditCardParams): string {
    if (typeof value !== 'string' || value === '') return 'format';
    const separators = params.separators;
    let count = 0;
    // A separator only ever sits BETWEEN digits, so the character to the right
    // of the cursor must be a digit whenever a separator is consumed — which
    // rejects a leading / trailing separator and two in a row.
    let expectDigit = true;
    for (let i = value.length - 1; i >= 0; i--) {
      const charCode = value.charCodeAt(i);
      if (charCode >= 48 && charCode <= 57) {
        count++;
        expectDigit = false;
        continue;
      }
      if (expectDigit) return 'format';
      if (separators === undefined || separators.indexOf(value[i]) === -1) return 'format';
      expectDigit = true;
    }
    if (expectDigit) return 'format';
    if (count < 12 || count > 19) return 'format';
    return luhnSum(value) % 10 === 0 ? '' : 'checksum';
  };
});

// pf_cardNetworkRules — the per-network prefix and length table, its own pure fn
// so the VALIDATOR and the MOCK GENERATOR share one copy. The table is fiddly
// (prefix ranges per network, the lengths each issues) and a mock that drifted
// from the validator would silently generate cards its own format rejects.
//
// It has to be a pure fn rather than a plain module export: factory bodies are
// inlined WITHOUT their lexical environment, so a factory referencing an
// imported const fails the build (PFE9011). A pure fn is the one thing a factory
// can reach out to, via `utl.getPureFn`. The mock is ordinary code and looks it
// up through `getRTUtils()`.
//
// The top level is frozen because two callers now share the object; the
// `readonly` types carry the rest of the intent.
registerPureFnFactory('rtFormats::cardNetworkRules', function () {
  const RULES: CardNetworkRules = {
    visa: {prefixes: [['4', '4']], lengths: [13, 16, 19]},
    mastercard: {
      prefixes: [
        ['51', '55'],
        ['2221', '2720'],
      ],
      lengths: [16],
    },
    amex: {
      prefixes: [
        ['34', '34'],
        ['37', '37'],
      ],
      lengths: [15],
    },
    discover: {
      prefixes: [
        ['6011', '6011'],
        ['644', '649'],
        ['65', '65'],
        ['622126', '622925'],
      ],
      lengths: [16, 19],
    },
    jcb: {prefixes: [['3528', '3589']], lengths: [16, 17, 18, 19]},
    diners: {
      prefixes: [
        ['300', '305'],
        ['3095', '3095'],
        ['36', '36'],
        ['38', '39'],
      ],
      lengths: [14, 15, 16, 17, 18, 19],
    },
    unionpay: {prefixes: [['62', '62']], lengths: [16, 17, 18, 19]},
    maestro: {
      prefixes: [
        ['5018', '5018'],
        ['5020', '5020'],
        ['5038', '5038'],
        ['5893', '5893'],
        ['6304', '6304'],
        ['6759', '6759'],
        ['6761', '6763'],
      ],
      lengths: [12, 13, 14, 15, 16, 17, 18, 19],
    },
  };
  Object.freeze(RULES);
  return function _card_network_rules(): CardNetworkRules {
    return RULES;
  };
});

// pf_matchesCardNetwork — passes when the number belongs to ANY of the declared
// networks. Each rule is a set of first-digit ranges plus the digit counts that
// network issues; both bounds of a range carry the same number of digits, so a
// plain string comparison of the equal-length head decides membership without
// parsing a number.
//
// Runs AFTER isCreditCard in the emitted `&&` chain, so the value is already
// known to be digits (plus separators) of a valid length.
registerPureFnFactory('rtFormats::matchesCardNetwork', function (utl: RTUtils) {
  const NETWORK_RULES = (utl.getPureFn('rtFormats::cardNetworkRules') as () => CardNetworkRules)();
  return function _matches_card_network(value: string, params: CreditCardParams): boolean {
    const networks = params.networks;
    if (networks === undefined || networks.length === 0) return false;
    const separators = params.separators;
    let digits = value;
    if (separators !== undefined) {
      digits = '';
      for (let i = 0; i < value.length; i++) {
        if (separators.indexOf(value[i]) === -1) digits += value[i];
      }
    }
    for (const network of networks) {
      const rule = NETWORK_RULES[network];
      if (rule === undefined) continue;
      if (rule.lengths.indexOf(digits.length) === -1) continue;
      for (const [low, high] of rule.prefixes) {
        const head = digits.slice(0, low.length);
        if (head >= low && head <= high) return true;
      }
    }
    return false;
  };
});

// ####### Doors for code OUTSIDE a pure-fn factory (the mock generator) #######
//
// A factory body is inlined without its lexical environment, so a factory can
// only reach a sibling through `utl.getPureFn`. Ordinary code has no such limit,
// but it should not be spelling string keys and casts at every call site either
// — so the keys live here, once, behind typed functions the caller imports.
//
// Lazy on purpose: an importer may load before the registrations above run.

/** The per-network prefix and length table the validator checks against. **/
export function getCardNetworkRules(): CardNetworkRules {
  return (getRTUtils().getPureFn('rtFormats::cardNetworkRules') as () => CardNetworkRules)();
}

/** The digit that, appended to `body`, makes it a valid card number. Appending a
 *  placeholder `0` first puts the body's digits in the SAME doubling positions
 *  the validator will see, and adds nothing to the sum, so this is the exact
 *  inverse of the validator's own check. **/
export function luhnCheckDigit(body: string): string {
  const luhnSum = getRTUtils().getPureFn('rtFormats::luhnSum') as (value: string) => number;
  return String((10 - (luhnSum(body + '0') % 10)) % 10);
}
