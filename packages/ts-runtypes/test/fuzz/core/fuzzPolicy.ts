// The seeding policy every lane starts from, and the ceilings that stop a
// lane's own safety valves from swallowing it silently.
//
// The policy: each lane keeps a PINNED default so CI is deterministic and a red
// build is always reproducible, but `RT_FUZZ_SEED` overrides it in the DEFAULT
// run of every lane — not just in the soak / replay branches, which is how it
// used to be for 9 of the 11 lanes. That gap meant the default run swept ONE
// frozen sample of the generated space on every CI run, forever: the oracles
// were properties, but nothing was exploring.
//
// So exploring is now one env var away (`RT_FUZZ_SEED=$RANDOM pnpm rtx core fuzz
// types`) and a nightly job can vary it without the ordinary build losing
// determinism. `laneSeed` also PRINTS the seed whenever it differs from the
// pinned default, so a failure from an explored seed replays from the log.

/** Parse an `RT_FUZZ_SEED`-style value: decimal, or `0x`-prefixed hex. **/
export function parseSeed(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback >>> 0;
  const parsed = raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw);
  return Number.isFinite(parsed) ? parsed >>> 0 : fallback >>> 0;
}

/** The base seed for a lane's DEFAULT (fixed-iteration) run: the pinned value,
 *  unless `RT_FUZZ_SEED` overrides it. `lane` only names the run in the log. **/
export function laneSeed(lane: string, pinned: number): number {
  const seed = parseSeed(process.env.RT_FUZZ_SEED, pinned);
  if (seed !== pinned >>> 0) {
    console.error(
      `[${lane}-fuzz] exploring with RT_FUZZ_SEED=0x${seed.toString(16)} (pinned default 0x${(pinned >>> 0).toString(16)})`
    );
  }
  return seed;
}

/** The base seed for a lane's SOAK run. A soak is explicitly an exploration, so
 *  it starts from `RT_FUZZ_SEED` and falls back to a pinned 1 for replayability. **/
export function soakSeed(): number {
  return parseSeed(process.env.RT_FUZZ_SEED, 1);
}

// --- Gates that must not be able to hide a whole lane -----------------------

/** Ceiling on the share of runs a lane's TS-validity gate may suppress.
 *
 *  Both `type/typeFuzzRunner.ts` and the json-schema lane DISCARD every
 *  violation recorded for a generated type that fails a TypeScript re-check —
 *  sound, because tsgo is lenient and still produces a RunType for input that
 *  does not compile, so a violation there is a generator false positive rather
 *  than a pipeline bug. The counter was only ever printed in soak logs, which
 *  meant a generator regression emitting mostly-invalid TypeScript would
 *  suppress every violation and leave the lane green and silent.
 *
 *  Observed rate is 0 across a 742-type soak, so 10% is far above the noise and
 *  still catches the failure mode. **/
export const SUPPRESSION_CEILING = 0.1;

/** Ceiling on the share of sequences a model-based lane may skip or write off
 *  as an unreproducible flake. The typemod lane only FAILS on a violation its
 *  shrinker can confirm; anything nondeterministic is logged and passes, which
 *  makes a genuinely nondeterministic reconciler bug unreportable. Keep the
 *  filter, but make a rising rate fail instead of accumulating in the log. **/
export const FLAKE_CEILING = 0.25;

/** Floor on the share of generated types that must reach the STRONG oracles
 *  rather than the robustness probe. The wild lane routes by a deliberately
 *  strict `valueOracleSafe` gate, so a large robustness share is normal and
 *  expected — this only catches the degenerate end, where a generator or gate
 *  regression leaves the lane turning its loop while asserting almost nothing.
 *  Set well under the observed rate. **/
export const STRONG_ORACLE_FLOOR = 0.1;

/** Floor on the share of json-schema fixtures whose two reflection sites were
 *  actually compared. Every fixture should reach the comparison, so this is set
 *  just low enough to tolerate the occasional scan timeout. **/
export const COMPARISON_FLOOR = 0.9;
