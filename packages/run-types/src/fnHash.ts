// getFnHash — derive the version-independent fnHash for an RT function family
// (+ its compile-time options) WITHOUT the plugin-injected function tuple.
//
// The runtime cache key every createX call site resolves is `<fnHash>_<typeId>`.
// The typeId half is always injected by the plugin (it needs the type-checker, so
// a consumer can never compute it — read it from getRunTypeId / an InjectRunTypeId
// marker). The fnHash half is a pure function of the operation family and its
// compile-time options, and — since the fnHash salt no longer folds the binary
// version (see internal/cachegen/operations/fnhash.go) — it is STABLE across
// ts-runtypes releases. So a framework (e.g. mion) that holds a type's injected
// typeId can rebuild the full key itself:
//
//   const key = getFnHash('val') + '_' + typeId;   // the validate entry for T
//
// instead of hand-pinning a `family → prefix` map that used to churn on every
// version bump. The values come from the Go-generated fnHashes table (the single
// source of truth is operations.FnHashFor); nothing is hashed at runtime.

import {
  FN_HASHES,
  HAS_UNKNOWN_KEYS_OPTION_LETTERS,
  VALIDATE_OPTION_LETTERS,
  type FnHashEntry,
} from './go-generated/fnHashes.generated.ts';

/** The Fn tokens getFnHash accepts — the InjectTypeFnArgs Fn keys for every
 *  createX factory and JSON value-level primitive (`val`, `verr`, `tb`, `fb`,
 *  `jsonEncoder`, `jsonDecoder`, `huk`, `pjs`, `cj`, …). */
export type FnHashKey = keyof typeof FN_HASHES;

/** Compile-time options that refine a family's fnHash — the SAME bag the createX
 *  factory takes. `noLiterals` / `noIsArrayCheck` select validate /
 *  validationErrors variants; `strategy` selects a JSON encoder / decoder
 *  variant. Options that don't apply to the resolved family are ignored (an
 *  option-less family has one fnHash regardless). */
export interface FnHashOptions {
  noLiterals?: boolean;
  noIsArrayCheck?: boolean;
  /** Selects the base `number` kind check (validate / validationErrors):
   *  'isFinite' (default) / 'typeof' / 'notNaN'. The two non-default values ride
   *  as canonical option names (numberTypeof / numberNotNaN) in the variant token. */
  numberMode?: string;
  strategy?: string;
  runsAfterValidation?: boolean;
  /** Arms the circular-reference guard — forks a CircularGuarded family's fnHash
   *  (validate / validationErrors / toBinary / jsonEncoder) by appending the 'C'
   *  variant token. Ignored for non-guarded families. */
  rejectCircularRefs?: boolean;
}

// Mirror of Go constants.NumberModeOptionName: the two non-default numberMode
// values are carried as canonical option names in VALIDATE_OPTION_LETTERS; the
// default isFinite (and any unrecognized value) adds no name.
function numberModeOptionName(mode: string | undefined): string {
  if (mode === 'typeof') return 'numberTypeof';
  if (mode === 'notNaN') return 'numberNotNaN';
  return '';
}

// Mirror of Go constants.ValidateVariantSuffix: 'N' + the letters of the present
// options concatenated in declaration order, or '' when none is set. The letter
// table itself is generated from the Go source, so only this assembly is
// hand-written (and it is pinned by fnHash.test.ts against the generated hashes).
function validateVariantToken(options: FnHashOptions | undefined): string {
  if (!options) return '';
  const numberModeName = numberModeOptionName(options.numberMode);
  let suffix = 'N';
  let hit = false;
  for (const [name, letter] of VALIDATE_OPTION_LETTERS) {
    const present = name === numberModeName || options[name as 'noLiterals' | 'noIsArrayCheck'];
    if (present) {
      suffix += letter;
      hit = true;
    }
  }
  return hit ? suffix : '';
}

// Mirror of Go constants.HasUnknownKeysVariantSuffix: 'O' + the letters of the
// present options in declaration order, or '' when none is set.
function hasUnknownKeysVariantToken(options: FnHashOptions | undefined): string {
  if (!options) return '';
  let suffix = 'O';
  let hit = false;
  for (const [name, letter] of HAS_UNKNOWN_KEYS_OPTION_LETTERS) {
    if (options[name as 'runsAfterValidation']) {
      suffix += letter;
      hit = true;
    }
  }
  return hit ? suffix : '';
}

/** Resolve the version-independent fnHash for a function family (+ options).
 *  Throws on an unknown fnKey or an option combination with no matching variant
 *  (e.g. an unknown JSON `strategy`). Accepts any string so a framework can pass
 *  a dynamic key; known keys get autocomplete via FnHashKey. */
export function getFnHash(fnKey: FnHashKey | (string & {}), options?: FnHashOptions): string {
  const entry = FN_HASHES[fnKey as FnHashKey] as FnHashEntry | undefined;
  if (!entry) throw new Error(`getFnHash: unknown fnKey ${JSON.stringify(fnKey)}`);
  let token = '';
  if (entry.axis === 'validateOptions') token = validateVariantToken(options);
  else if (entry.axis === 'jsonStrategy') token = options?.strategy ?? entry.defaultVariant ?? '';
  else if (entry.axis === 'hasUnknownKeysOptions') token = hasUnknownKeysVariantToken(options);
  // CircularGuarded families fork on rejectCircularRefs: the armed variant's token
  // is the base token with a trailing 'C' (mirror of Go's circularCanonicalSuffix).
  if (entry.circularGuarded && options?.rejectCircularRefs) token += 'C';
  const hash = entry.variants[token];
  if (hash === undefined) throw new Error(`getFnHash: fnKey ${JSON.stringify(fnKey)} has no ${JSON.stringify(token)} variant`);
  return hash;
}
