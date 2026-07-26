---
type: feature
spec: guidelines
status: done
created: 2026-07-26
completed: 2026-07-26
---

# Lint settings: make `settings.runtypes.binary` real, and stop ignoring unknown keys silently

**Status:** done (see [Implemented](#implemented))
**Created:** 2026-07-26 (deferred twice from [docs/done/getexepath-env-override.md](../done/getexepath-env-override.md) and [docs/done/lint-settings-binary-ignored.md](../done/lint-settings-binary-ignored.md))

Two halves of the same surface, filed together because the second changes what the first must warn
about. Both were deliberately deferred while `RT_BIN` shipped; neither is urgent, both are tidy.

## Half 1 — `settings.runtypes.binary`

`sessionOptions()` ([packages/ts-runtypes-devtools/src/eslint/index.ts](../../packages/ts-runtypes-devtools/src/eslint/index.ts))
reads only `timeoutMs` and `tsconfig`; `LINT_SETTING_KEYS` in
[session-protocol.ts](../../packages/ts-runtypes-devtools/src/eslint/session-protocol.ts) is the
exhaustive list. A `binary` there is dropped on purpose: the plugin resolves the host binary itself,
"like any other linter". `RT_BIN` now covers the need, so this is ergonomics, not capability — a
lint config could pin a binary without an env var.

Thread it the way `tsconfig` already flows: `sessionOptions()` → `LintSessionOptions` →
`LintWorkerRequest` → `ensureConnection()` in
[lint-worker.ts](../../packages/ts-runtypes-devtools/src/eslint/lint-worker.ts), read once when the
long-lived connection opens (later files' values are ignored — say so in the comment, as `tsconfig`
does).

Decisions to make:

- **Precedence against `RT_BIN`.** The bundler lane resolves `options.binary ?? getExePath()`, so
  the explicit option wins over the env var. Matching that (`settings.binary` > `RT_BIN` > platform
  package) is the consistent choice, but it means an env var cannot override a checked-in config —
  state whichever way you pick, in the code and in SETUP.md.
- **`cwd` stays dropped?** It is dropped for a stronger reason than `binary` ever was: the session's
  whole model is "run where the linter runs". Probably keep dropping it, but decide explicitly
  rather than leave the asymmetry unexplained.
- The transparency test (`sessionOptions — timeoutMs and tsconfig are configurable` in
  [test/eslint/plugin.test.ts](../../packages/ts-runtypes-devtools/test/eslint/plugin.test.ts)) pins
  today's drop. Update it, do not delete it.
- The e2e fixture used to pass this key and had it silently ignored; it now uses `tsconfig` +
  `RT_BIN`. Leave it alone unless there is a reason to switch it back.

## Half 2 — unknown keys under `settings.runtypes`

A key the plugin does not consume is a **silent no-op** today. That is exactly how the e2e fixture
sat broken: its config set `cwd` and `binary`, its comment claimed they worked, and nothing said
otherwise until someone read `sessionOptions()`. A typo (`tsConfig`, `timeout`) behaves identically.

The hard part is not detecting it (compare against `LINT_SETTING_KEYS`) but **reporting** it:

- A linter has nowhere natural to report a config complaint — findings are per file, per rule.
- Reporting per file would repeat the same message for every linted file in the run.
- The plugin already solves the shape for engine errors: `engineErrorClaims` makes the first rule to
  see a file own the reporting for it. A process-wide "claim once" variant is the obvious analogue.
- Consider whether a bare `console.warn` at first use is better than a lint report: it cannot be
  suppressed per rule, but it also cannot be mistaken for a finding about the code.
- Whatever it is, it must fire **once per process**, not once per file, and name the key plus the
  accepted set.

## Tests

- `sessionOptions()` maps `binary`; the worker request carries it.
- A real-linter case in [test/eslint/oxlint-e2e.test.ts](../../packages/ts-runtypes-devtools/test/eslint/oxlint-e2e.test.ts)
  proving a configured binary reaches the resolver — mirror the `RT_BIN` case already there, which
  gives you the precedence assertion for free (config + env set at once).
- The unknown-key warning appears exactly once across several linted files, and names the key.

## Done when

- `settings.runtypes.binary` takes effect, with its precedence against `RT_BIN` documented in
  SETUP.md and in the plugin comments.
- An unsupported key under `settings.runtypes` produces one visible complaint per run.
- `LINT_SETTING_KEYS` still generates from `LintSessionOptions`, so the accepted set cannot drift.

## Implemented

Both halves, with the recommended answers to the open questions.

**`settings.runtypes.binary` is real.** It threads `sessionOptions()` → `LintSessionOptions` →
`LintWorkerRequest` → `ensureConnection()`, read once when the long-lived connection opens, exactly
like `tsconfig` (documented on both the interface and the wire type).

- **Precedence: `settings.runtypes.binary` > `RT_BIN` > dev binary > platform package.** It falls
  out of the implementation rather than being special-cased: the worker uses the configured path if
  there is one, otherwise calls `getExePath()`, which is itself what reads `RT_BIN`. That matches
  the bundler lane (`options.binary ?? getExePath()`), so an explicit config beats an env var
  everywhere. The e2e test sets both at once to pin it.
- **A configured path that is not there fails loudly**, naming the setting
  (`settings.runtypes.binary=… does not exist`), via `resolveConfiguredBinary()` in the worker —
  the same never-fall-back rule the launcher applies to `RT_BIN`, checked up front so a typo reads
  as a config mistake rather than an opaque spawn failure.
- **`cwd` stays dropped**, as the spec expected: the session's model is "run where the linter runs".
  `socket` too.

**Unknown keys warn once per process.** `warnUnknownSettings()` in `eslint/index.ts` compares the
bag against `LINT_SETTING_KEYS` and `console.warn`s the first time it sees each unsupported key,
naming the key and the supported set. Reasoning for stderr over a lint report: a config mistake is
not a finding about anyone's code, and there is no honest file to anchor it to. Once per *key* per
*process*, so a thousand-file lint prints one line.

**Tests** — `plugin.test.ts` covers the mapping (the transparency case now expects `binary` kept,
`cwd`/`socket` dropped), the warn-once behaviour, and silence on supported keys.
`oxlint-e2e.test.ts` gains a real-linter case: the configured binary produces the baseline findings,
a bogus `RT_BIN` alongside a good setting does NOT break the run (precedence), and a bogus setting
fails naming itself. Its fixture config previously carried a bogus `binary` to prove it was
IGNORED — that premise is inverted, so it now carries a bogus `cwd` instead, which is still the
right transparency case. `e2e-lint-settings.test.ts` tracks the three-key contract.

**Docs:** SETUP.md documents the setting, the full precedence order and the warn-on-unknown-key
behaviour, next to `RT_BIN`. Nothing on the website or in the package READMEs: this is a
development knob, per the review decision recorded in
[getexepath-env-override.md](getexepath-env-override.md).

**Not done:** the spec floated switching the e2e fixture back to `settings.runtypes.binary` now
that it works. Left alone deliberately — the fixture's `RT_BIN` path is exercised by the release
lane as-is, and churning it again would retire that coverage for no gain.
