// The WHOLE credit-card format in one file: the public type and builder, the pure fns behind them,
// the network table, and the two doors ordinary code uses to reach those. Split out of the shared
// string-format files because the card format carries more machinery than any other string format,
// and the shape to copy for the next format that outgrows them: one module, re-exported from
// `src/formats/index.ts`, which also side-effect imports it so the registrations happen before any
// user code touches it. The Go emitter records this path as the pure fns' canonical source
// (creditCardPureFnFilePath in internal/cachegen/typefunctions/formats/string/creditcard.go), so keep
// the two in sync if either moves.

import {registerPureFnFactory} from '../../runtypes/pureFn.ts';
import {luhnSumId, isCreditCardId, cardNetworkRulesId, matchesCardNetworkId} from '../../runtypes/pure-fn-ids.generated.ts';
import {getRTUtils} from '../../runtypes/rtUtils.ts';
import type {RTUtils} from '../../runtypes/rtUtils.ts';
import {presetFormatBuilder, type CreditCardTransformParams, type Override, type PresetFormat} from './stringFormats.ts';

// ───────────────────────────── Credit card ──────────────────────────

/** Every card network `CreditCard` knows, as a runtime list: the `CardNetwork` union derives from it,
 *  so the two can never disagree, and the mock generator picks from this rather than its own list. **/
export const CARD_NETWORKS = ['visa', 'mastercard', 'amex', 'discover', 'jcb', 'diners', 'unionpay', 'maestro'] as const;

/** A card network `CreditCard` can pin. */
export type CardNetwork = (typeof CARD_NETWORKS)[number];

/** The failure modes `CreditCard` reports in `TypeFormatError.errorType`: `'format'` (not shaped like
 *  a card number), `'checksum'` (right shape, the digits do not add up: the mistyped-digit case) or
 *  `'network'` (a good card, not one this field takes; only with `networks`). Safe to switch on. **/
export type CreditCardErrorType = 'format' | 'checksum' | 'network';

/** Params for `CreditCard`; a failing value reports WHICH way it failed in the error's `errorType`. **/
export interface CreditCardParams {
  /** The networks the field accepts. Omitted means any network, and the network table then never
   *  reaches the emitted code at all: the check is digits plus the Luhn checksum. */
  networks?: readonly CardNetwork[];
  /** The characters allowed BETWEEN digits, as one string, `' -'` by default: `4111 1111 1111 1111`
   *  and `4111-1111-1111-1111` both pass out of the box. A leading or trailing separator, or two in a
   *  row, never passes. Pass `''` for digits and nothing else. Accepting the grouping does not rewrite
   *  it: `transform: {stripSeparators: true}` does. **/
  separators?: string;
  /** Value rewrite (`{stripSeparators: true}` gives bare digits back), OFF by default and deliberately
   *  separate from `separators`: accepting the grouping someone typed and rewriting it are two
   *  decisions. Applied only by `createFormatTransformFn` and mion's `sanitizeParams`, never inside
   *  validate or decode. **/
  transform?: CreditCardTransformParams;
}
// No `mockSamples`, unlike the pattern-backed formats: a regex cannot be reversed, so those need a
// declared pool, while a card number can be GENERATED fresh per draw (mockCreditCard, plus the
// `testCreditCards` mock option for the well-known sandbox numbers).

// Spaces and dashes are how a card number is written, printed and typed, so accepting them is the
// useful default rather than an opt-in. `TF.CreditCard<{separators: ''}>` is the digits-only field.
type DEFAULT_CREDIT_CARD_PARAMS = {separators: ' -'};

/** A payment card number: 12 to 19 digits whose Luhn checksum holds, which catches a single mistyped
 *  digit. Spaces and dashes between digits are accepted by default; `networks` narrows the issuers. **/
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type CreditCard<P extends Override<CreditCardParams> = {}> = PresetFormat<'creditCard', DEFAULT_CREDIT_CARD_PARAMS, P>;

/** Payment card number (`CreditCard`); `networks` pins the issuers, `separators` accepts grouping. **/
export const creditCard = presetFormatBuilder<'creditCard', DEFAULT_CREDIT_CARD_PARAMS, Override<CreditCardParams>>('creditCard');

// Split in TWO on purpose, with NO `utl.getPureFn` edge between them: the Go emitter references
// `matchesCardNetwork` only when the format declares `networks`, so a bare `CreditCard` never drags
// the network table into the emitted cache, and a dependency edge would ship both bodies to every call
// site (the extractor records transitive deps). The price is that each strips `separators` itself.

/** One network's issuing rules: the first-digit RANGES it uses (both bounds of a range carry the same
 *  number of digits) and the card lengths it issues. **/
export interface CardNetworkRule {
  prefixes: readonly (readonly [string, string])[];
  lengths: readonly number[];
}
/** The whole table, keyed by network name. Exported so the mock generator can type its
 *  `getPureFn(cardNetworkRules)` lookup; the VALUE stays the pure fn's, so there is one copy. **/
export type CardNetworkRules = Readonly<Record<string, CardNetworkRule>>;

// The Luhn doubling rule in ONE place; it skips anything that is not a digit, so a grouped number sums
// like a bare one. Shared by the VALIDATOR (is the sum a multiple of 10) and the MOCK GENERATOR (which
// final digit would make it one), because two copies of a doubling loop drift.
export const luhnSum = registerPureFnFactory(function () {
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
}, luhnSumId);

// The base card-number check: 12 to 19 digits whose Luhn checksum is a multiple of 10, which catches a
// mistyped digit where a length + character-class test does not. Returns the FAILURE MODE rather than
// a boolean ('' good card, 'format' not shaped like one, 'checksum' shaped but not adding up), which
// feeds the `type` field of the emitted format error; validate compares against '' and pays nothing
// for it. The walk here settles SHAPE only, the checksum is luhnSum's, shared with the mock generator.
export const isCreditCard = registerPureFnFactory(function (utl: RTUtils) {
  const luhnSumFn = utl.getPureFn(luhnSum) as (value: string) => number;
  return function _is_credit_card(value: string, params: CreditCardParams): string {
    if (typeof value !== 'string' || value === '') return 'format';
    const separators = params.separators;
    let count = 0;
    // A separator only ever sits BETWEEN digits, so the character to the right of the cursor must be a
    // digit whenever a separator is consumed, which rejects a leading / trailing one and two in a row.
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
    return luhnSumFn(value) % 10 === 0 ? '' : 'checksum';
  };
}, isCreditCardId);

// The per-network prefix and length table, its own pure fn so the VALIDATOR and the MOCK GENERATOR
// share one copy: a mock that drifted from the validator would silently generate cards its own format
// rejects. It has to be a pure fn rather than a plain module export, since factory bodies are inlined
// WITHOUT their lexical environment and a factory referencing an imported const fails the build
// (PFE9011); `utl.getPureFn` is the one way out, and the mock looks it up through `getRTUtils()`.
// The top level is frozen because two callers share the object.
export const cardNetworkRules = registerPureFnFactory(function () {
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
}, cardNetworkRulesId);

// Passes when the number belongs to ANY of the declared networks. Both bounds of a prefix range carry
// the same number of digits, so a plain string comparison of the equal-length head decides membership
// without parsing a number. Runs AFTER isCreditCard in the emitted `&&` chain, so the value is already
// known to be digits (plus separators) of a valid length.
export const matchesCardNetwork = registerPureFnFactory(function (utl: RTUtils) {
  const NETWORK_RULES = (utl.getPureFn(cardNetworkRules) as () => CardNetworkRules)();
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
}, matchesCardNetworkId);

// ####### Doors for code OUTSIDE a pure-fn factory (the mock generator) #######
// A factory body is inlined without its lexical environment, so a factory can only reach a sibling
// through `utl.getPureFn`. Ordinary code has no such limit, but the keys live here once, behind typed
// functions, instead of a string key and a cast at every call site.
// Lazy on purpose: an importer may load before the registrations above run.

/** The per-network prefix and length table the validator checks against. **/
export function getCardNetworkRules(): CardNetworkRules {
  return (getRTUtils().getPureFn(cardNetworkRules) as () => CardNetworkRules)();
}

/** The digit that, appended to `body`, makes it a valid card number. The placeholder `0` puts the
 *  body's digits in the SAME doubling positions the validator will see and adds nothing to the sum,
 *  so this is the exact inverse of the validator's own check. **/
export function luhnCheckDigit(body: string): string {
  const luhnSumFn = getRTUtils().getPureFn(luhnSum) as (value: string) => number;
  return String((10 - (luhnSumFn(body + '0') % 10)) % 10);
}
