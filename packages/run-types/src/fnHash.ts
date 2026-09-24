// getFnHash — the fnHash half of the `<fnHash>_<typeId>` runtime cache key every createX call site
// resolves, derived WITHOUT the plugin-injected function tuple. The typeId half always comes from
// the plugin (it needs the type-checker, so read it from getRunTypeId / an InjectRunTypeId marker),
// but the fnHash is a pure function of the family + its compile-time options and is STABLE across
// mion releases, since its salt no longer folds the binary version (see
// internal/cachegen/operations/fnhash.go). So a framework holding an injected typeId can rebuild the
// key itself (`getFnHash('validate') + '_' + typeId`) instead of hand-pinning a `family → prefix`
// map that used to churn on every version bump. Values come from the Go-generated fnHashes table
// (source of truth: operations.FnHashFor); nothing is hashed at runtime.

import {FN_HASHES, VALIDATE_OPTION_LETTERS, type FnHashEntry} from './go-generated/fnHashes.generated.ts';

/** The Fn tokens getFnHash accepts — the InjectTypeFnArgs Fn keys for every
 *  createX factory and JSON value-level primitive (`val`, `verr`, `tb`, `fb`,
 *  `jsonEncoder`, `jsonDecoder`, `ruk`, `pjs`, `cj`, …). */
export type FnHashKey = keyof typeof FN_HASHES;

/** The createX factory's own compile-time bag; `strategy` picks a JSON variant, options foreign to the family are ignored. */
export interface FnHashOptions {
  /** Selects the base `number` kind check (validate / validationErrors):
   *  'isFinite' (default) / 'typeof' / 'notNaN'. The two non-default values ride
   *  as canonical option names (numberTypeof / numberNotNaN) in the variant token. */
  numberMode?: string;
  strategy?: string;
  /** Arms the circular-reference guard — forks a CircularGuarded family's fnHash
   *  (validate / validationErrors / toBinary / jsonEncoder) by appending the 'C'
   *  variant token. Ignored for non-guarded families. */
  rejectCircularRefs?: boolean;
}

// Mirror of Go constants.NumberModeOptionName: the two non-default numberMode values ride as
// canonical option names in VALIDATE_OPTION_LETTERS; isFinite and anything unrecognized add none.
function numberModeOptionName(mode: string | undefined): string {
  if (mode === 'typeof') return 'numberTypeof';
  if (mode === 'notNaN') return 'numberNotNaN';
  return '';
}

// Mirror of Go constants.ValidateVariantSuffix; only this assembly is hand-written, getFnHash.test.ts pins it.
function validateVariantToken(options: FnHashOptions | undefined): string {
  if (!options) return '';
  const numberModeName = numberModeOptionName(options.numberMode);
  let suffix = 'N';
  let hit = false;
  for (const [name, letter] of VALIDATE_OPTION_LETTERS) {
    if (name === numberModeName) {
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
  // Mirror of Go's circularCanonicalSuffix: the armed variant's token is the base token plus 'C'.
  if (entry.circularGuarded && options?.rejectCircularRefs) token += 'C';
  const hash = entry.variants[token];
  if (hash === undefined) throw new Error(`getFnHash: fnKey ${JSON.stringify(fnKey)} has no ${JSON.stringify(token)} variant`);
  return hash;
}
