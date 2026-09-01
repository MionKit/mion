// The seeding policy every lane starts from, and the ceilings that stop a
// lane's own safety valves from swallowing it silently.
//
// The policy: NO lane carries a pinned seed. Each derives its entry seed from
// the package VERSION, so a run is reproducible within a release (a red build
// replays exactly, a green one stays green) while every version bump rotates
// the ground the lanes explore. `MION_FUZZ_SEED` still overrides for replay, and
// the seed is ALWAYS logged next to the command that reproduces it.
//
// Why not a timestamp: it makes every CI run nondeterministic, so a PR can go
// red for a latent bug it did not introduce and a re-run answers differently.
// Why not a constant: nothing ever explores new ground, which is how a whole
// release cycle of findings once banked up against one release
// (docs/done/drain-fuzz-soak-backlog.md).
//
// Exploring BETWEEN releases is the SOAK lanes' job, not this one's: both
// release-gate.yml and fuzz-soak.yml set MION_FUZZ_SEED from the run id, so a
// soak still gets fresh ground on every run.

import {readFileSync} from 'node:fs';
import {hashString} from './seededRng.ts';

/** Parse an `MION_FUZZ_SEED`-style value: decimal, or `0x`-prefixed hex. **/
export function parseSeed(raw: string | undefined, fallback: number): number {
  if (!raw) return fallback >>> 0;
  const parsed = raw.startsWith('0x') ? parseInt(raw, 16) : Number(raw);
  return Number.isFinite(parsed) ? parsed >>> 0 : fallback >>> 0;
}

const VERSION_FILE = new URL('../../../../../version.json', import.meta.url);
let cachedVersion: string | undefined;

/** The lockstep version every package and the published binary share.
 *
 *  Read from version.json rather than the Go `constants.Version`, which is the
 *  literal string "dev" in anything but a release build — seeding from that
 *  would be a pinned constant wearing a disguise. **/
export function packageVersion(): string {
  if (cachedVersion !== undefined) return cachedVersion;
  const {version} = JSON.parse(readFileSync(VERSION_FILE, 'utf8')) as {version?: string};
  if (!version) throw new Error(`${VERSION_FILE.pathname}: no "version" field to seed from`);
  cachedVersion = version;
  return version;
}

/** The entry seed for one lane: `MION_FUZZ_SEED` when set, otherwise derived from
 *  the package version so the run is reproducible within a release and rotates
 *  with each bump. The lane name is folded in so two lanes never share a draw
 *  sequence.
 *
 *  ALWAYS logs. A finding whose seed nobody recorded costs a bisect instead of
 *  a re-run, so the log line is the feature, not decoration. **/
export function entrySeed(lane: string): number {
  const override = process.env.MION_FUZZ_SEED;
  const seed = override ? parseSeed(override, 0) : hashString(`${packageVersion()}:${lane}`);
  const hex = `0x${seed.toString(16)}`;
  const origin = override ? 'from MION_FUZZ_SEED' : `from version ${packageVersion()}`;
  console.error(`[${lane}-fuzz] seed ${hex} ${origin} — replay: MION_FUZZ_SEED=${hex} pnpm rtx core fuzz ${lane}`);
  return seed;
}

// --- Gates that must not be able to hide a whole lane -----------------------

/** Ceiling on the share of runs a lane's TS-validity gate may suppress.
 *
 *  `type/typeFuzzRunner.ts` DISCARDS every
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
