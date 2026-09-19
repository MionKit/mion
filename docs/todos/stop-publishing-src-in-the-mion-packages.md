---
type: chore
spec: guidelines
status: ready
created: 2026-09-19
---

# Stop publishing `src` in the mion packages, and prove nothing breaks

## Intent

Every published mion package ships its TypeScript sources: client, core, devtools, router,
run-types, all the platform adapters, all the drizzle packages. That is roughly a whole
second copy of each package in every tarball, and a consumer's bundler never reads it.

The reason it is there is the `source` export condition, which points at `./src/index.ts`
and friends. In-repo that condition is load-bearing: the root `tsconfig.json` sets
`customConditions: ["source"]` and `vitest.config.ts` sets `resolve.conditions: ['source']`,
so the workspace packages type-check and test against each other's sources with no build.
Nothing rewrites the manifest at publish time, so dropping `src` while keeping the condition
would leave it pointing at files the tarball does not carry.

Find out who actually resolves that condition in a PUBLISHED install, and drop what nobody
needs.

## Direction

Start from the two ends that must stay true, then decide the middle:

- In-repo resolution must keep working exactly as it does now. It is not optional: without
  it every package resolves its siblings' stale dist.
- A published consumer must keep working, including a consumer that deliberately asks for
  the `source` condition (some bundler setups do, and a dangling condition is worse than an
  absent one).

Already established, so do not re-derive:

- The built-in pure function bodies no longer need `src`. `@mionjs/run-types` serves them
  from `dist/mion-pure-fns/`, written by its own build.
- `scripts/release/pack.mjs` does not rewrite any manifest, so the published `package.json`
  is the workspace one, character for character.
- `repo-contracts.test.ts` asserts `src` is in run-types' `files` and pins the exact `!src`
  negations. Whatever this change decides, that block moves with it.

Roads to weigh, with their costs:

- **Drop `src` and the `source` condition from the published manifest only**, by rewriting
  the manifest at pack time. Keeps in-repo resolution untouched and the tarball honest. Cost:
  a new publish-time transform, and every package's manifest now differs between the repo and
  the registry, which is a thing a reader has to know.
- **Drop `src` and keep the condition.** Cheapest, and wrong for anyone who asks for the
  condition. Only acceptable if the investigation shows nobody can.
- **Keep both.** The status quo. State the size it costs before recommending it.

Say plainly which packages this applies to: it is all of them or none, since the condition
is the same shape everywhere.

## Done when

- A written answer naming who resolves the `source` condition in a published install, backed
  by the code or the tooling that proves it.
- A recommended road with its cost, or a clear statement of why the sources should stay.
- If sources stop shipping: the `pre-publish-e2e` lane passes, since it packs the real
  tarballs and installs them into consumers built several ways. That is the gate that catches
  a dangling export condition, so the PR carries the `pre-publish-e2e` label.
- `repo-contracts.test.ts` updated to assert whatever the new rule is, rather than deleted.
