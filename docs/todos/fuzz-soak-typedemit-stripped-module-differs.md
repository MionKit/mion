---
type: fix
spec: guidelines
status: ready
created: 2026-10-19
---

# typedemit soak: a stripped typed module differs from emitMode both (oracle TE1)

## Evidence

Release gate run 39249346902 on `main` @ `f95566c2d`, lane `fuzz soak · typedemit`.
Replay: `MION_FUZZ_SEED=39249346902 pnpm miondevx core fuzz typedemit --soak`.

```
oracle: TE1, seed: 1303986095, target: rt/xiLnu9rqMz
rt/xiLnu9rqMz: stripped typed module differs from emitMode both at 367
  ts:   …nftjo@4la.fyqmeghtzeu\",\"sog4szo2@il6wkhx.xvpax\",\"z@30jgt0.wgdtdv\",…
  both: …pi3lknvx@2ezctxmy.ut\",\"s4sb@7f5dwplug75.vmrt\",\"10s@3-467x-.mlyvylsbgbw\",…
```
(test/fuzz/type/typedEmitFuzz.integration.test.ts:30)

## Intent

TE1 says the `emitMode: 'ts'` module, with its types stripped, must equal the `both` output byte for byte.
Here they diverge inside what looks like generated email sample data (pattern samples or mock seeds),
so one emit path draws different sample values than the other. Find why the two emits are not
deterministic with respect to each other (seeding, iteration order, a shared sampler's state) and fix the root cause.

## Done when

- The failing seed replays green with the command above.
- A regression test pins the shape that diverged.

## Plan: oracle fix (approved 2026-10-19, automatic mode)

Root cause: not an emitter bug. A pattern with no declared `mockSamples` gets a pool drawn under the engine's
per-build random key (`jsengine.newSessionKey`), on purpose: the docs say unseeded pools change every build.
TE1 compiles the two modes in two resolver processes, so each draws a different pool and the byte compare fails.
The 30-round default rarely draws a pattern leaf; the soak does.

- `packages/devtools/test/helpers/typedEmit.ts`: `normalize` blanks every `"mockSamples":[…]` array to a
  placeholder, next to the other by-design differences. Presence stays checked; pool content is per build.
  Covers both users (the typed-emit fuzz lane, `compile-cli-ts.test.ts`).
- Tests: `typedEmitFuzz.unit.test.ts` pins the diverged shape (two pools differ → parity holds; pool dropped →
  violation). A binary-backed smoke test compiles the failing shape in both modes and checks TE1.
- Fix the stale "deterministic per pattern" comments (constants.go, codes_runtype.go, unplugin.ts, StringFormat suite).
- No docs page change: the website already states pools change every build.
- Green bar: the seed replay `MION_FUZZ_SEED=39249346902 pnpm miondevx core fuzz typedemit --soak`.
