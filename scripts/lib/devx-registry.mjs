// The miondevx command table: ONE registry that renders the help, builds the
// per-area usage lines, and tells the entry point whether a command needs the
// engine (bin/mion + the marker/plugin dists) built first. A command exists only
// if it has a row here; the area dispatchers look their sub up in this table
// before running it, so help, usage and the build gate can never drift apart.
//
// Row shape:
//   name     the sub-command word (the area's own flags live on the area)
//   args     positional hint shown after the name, e.g. '<suite…>'
//   summary  one plain sentence, what it does
//   flags    [[spec, help]] pairs; a spec with a value reads '--one <name>'
//   build    the gate switch: false = never builds; a function of the args after
//            the sub = decided per call; absent = builds (the safe default)
//   commands nested verbs (bench servers <verb>) with the same row shape
// An area may also set `bareBuild: false` when its no-sub form only prints help
// (release), as opposed to being a real run (bench).
//
// Plain module, no side effects: the tests import it directly.

import {existsSync, readdirSync} from 'node:fs';
import {join} from 'node:path';
import {REPO_ROOT} from './env.mjs';

export const CLI = 'miondevx';
export const HELP_WIDTH = 100;
const NAME_COL_CAP = 28;
const SUMMARY_MIN = 40;
const HELP_FLAGS = new Set(['help', '-h', '--help']);

export const hasFlag = (args, ...names) => args.some((arg) => names.includes(arg));
export const isHelpFlag = (arg) => HELP_FLAGS.has(arg);

const noBuild = {build: false};

// The e2e lanes consume the packed tarballs. In CI they run on a checkout with
// NO Go submodule (the tarballs come from the build job as an artifact), so the
// gate must not demand the engine there; on a dev host with no tarballs the
// lane packs them itself, which builds the @mionjs/* dists through the devtools
// plugin and so DOES need bin/mion first. `tarballs` is injectable for the test.
export const tarballsPresent = () => {
  const dir = join(REPO_ROOT, 'tarballs');
  return existsSync(dir) && readdirSync(dir).some((file) => file.endsWith('.tgz'));
};
const flagValue = (args, flag) => {
  const at = args.findIndex((arg) => arg === flag || arg.startsWith(`${flag}=`));
  if (at === -1) return undefined;
  return args[at].includes('=') ? args[at].slice(flag.length + 1) : args[at + 1];
};
// e2e packs when asked (--pack) or when nothing is packed yet, except on the
// post-publish road (--backend npm), which installs the LIVE packages instead.
export const e2ePacksItself = (args, {tarballs = tarballsPresent()} = {}) => hasFlag(args, '--pack') || (!tarballs && flagValue(args, '--backend') !== 'npm');
// drizzle-e2e packs only when nothing is packed yet (it repacks stale tarballs
// on its own, which assumes a built host, as it always did).
export const drizzleE2ePacksItself = (args, {tarballs = tarballsPresent()} = {}) => !tarballs;

export const AREAS = {
  core: {
    summary: 'the engine (Go resolver + TS marker/plugin)',
    commands: [
      {
        name: 'build',
        args: '[targets…]',
        summary: 'build the binary + dev dists if stale (go|linux-go|linux-extract|marker-dist|plugin-dist|uws|all)',
        flags: [['--trust-stamp', 'skip the reference build when bin/.mion.stamp matches (the gate and the pre-hooks)']],
        ...noBuild,
      },
      {name: 'smoke', summary: 'end-to-end smoke of the resolver + devtools'},
      {
        name: 'test-batches',
        summary: 'the batched whole vitest suite (what test:ci runs)',
        flags: [
          ['--check', 'gate the batches against vitest.config.ts (the CI drift gate, no build)'],
          ['--list', 'print the batches and stop'],
        ],
        build: (args) => !hasFlag(args, '--check', '--list'),
      },
      {
        name: 'fuzz',
        args: '<suite…>',
        summary: 'run fuzz lanes: unit|value|types|nondata|roundtrip|size|cloning|elision|enrich|i18n|typemod|race|sidecar|patterngen|convert|convertcli|drizzletypes|all',
        flags: [
          ['--quick', 'the per-PR budget tier (ci.yml)'],
          ['--soak', 'the release tier (release-gate.yml / fuzz-soak.yml)'],
        ],
      },
      {name: 'fuzz-lanes', summary: "print the soak lane list as JSON (the workflows' matrix source)", ...noBuild},
      {
        name: 'codegen',
        args: '[all|constants|kind|fnhashes|typeformats|diag|builtinpurefns|pluginkeys|sidecar]',
        summary: 'regenerate the Go→TS mirrors, the pure-fn table and the sidecar bundle',
        flags: [['--check', 'regenerate, then fail if a committed output drifted']],
      },
      {
        name: 'drizzle-manifest',
        summary: 'refresh the drizzle proxy column manifests from drizzle-orm',
        flags: [
          ['--check', 'CI gate: drift + pending entries + migrated-wrapper coverage'],
          ['--pending', 'list the entries awaiting review'],
        ],
        ...noBuild,
      },
      {
        name: 'converted-suites',
        summary: 'convert the suite tree into the builders form, run it, remove it',
        flags: [
          ['--target <form>', 'the form to convert into'],
          ['--keep', 'keep the converted tree afterwards'],
        ],
      },
      {
        name: 'drizzle-suites',
        summary: "fetch + sha256-verify drizzle's own integration suites at the pinned tag",
        flags: [
          ['--record', 're-pin at a new tag'],
          ['--check', 'verify the pin without downloading'],
        ],
        ...noBuild,
      },
      {
        name: 'drizzle-translate',
        summary: 'translate those suites onto the slim packages (no container, no database)',
        flags: [
          ['--to-types', 'convert the translated tree again onto the pure-type road'],
          ['--keep', 'keep the translated tree afterwards'],
        ],
      },
      {
        name: 'bump-tsgolint',
        args: '[<rev>]',
        summary: 'move the tsgolint/typescript-go pin (default: latest release), re-patch, rebuild + test',
        flags: [['--skip-tests', 'rebuild only, skip the test run']],
        ...noBuild,
      },
      {
        name: 'ensure-tsgolint',
        summary: 'check the submodule out to tsgolint.pin.json + re-apply the shim patches',
        flags: [['--check', 'verify only, change nothing']],
        ...noBuild,
      },
    ],
  },
  website: {
    summary: 'the docs site (one Nuxt install, three subsites: /rpc, /runtypes, /benchmarks)',
    commands: [
      {name: 'dev', summary: 'hot-reload docs server on :3000', flags: [['--agent', 'agent mode on :3100']]},
      {
        name: 'build',
        summary: 'build the docs site WITH the benchmarks',
        flags: [
          ['--no-bench', 'reuse the recorded benchmark data'],
          ['--quick', 'the short benchmark run'],
          ['--ssr', 'server build instead of static generate'],
          ['--skip-playground', 'skip the playground WASM build'],
        ],
      },
      {name: 'preview', summary: 'serve the static site locally, regenerating it first', flags: [['--no-build', 'serve the existing .output/public as-is']]},
      {
        name: 'check',
        summary: 'serves-a-page smoke of the dev container',
        flags: [
          ['--docs', 'also verify code-import + twoslash rendering'],
          ['--static', 'serve the BUILT site + assert every benchmark page renders (no build)'],
        ],
        build: (args) => !hasFlag(args, '--static'),
      },
      {name: 'test-counts', summary: "recount the homepage's test tiles (vitest list + go test -list)", flags: [['--check', 'fail instead of writing']]},
      {name: 'container-build', summary: 'container-only prod build (not the full pipeline)'},
      {name: 'shell', summary: 'debug shell inside the website container', ...noBuild},
    ],
  },
  bench: {
    summary: 'the validation benchmarks (bare = the default run)',
    flags: [
      ['--one <name>', 'one competitor'],
      ['--full', 'the full matrix'],
      ['--website', 'the website subset'],
      ['--build-only', 'build the lanes, measure nothing'],
      ['--quick', 'the short run'],
    ],
    commands: [
      {name: 'audit', summary: 'audit every competitor map'},
      {name: 'typecheck', summary: 'compile every competitor map in the image (totality gate)'},
      {name: 'engine-check', summary: 'check the engine inside the image'},
      {name: 'typecost', summary: 'type-cost benchmark'},
      {name: 'compiletime', summary: 'compile-time benchmark'},
      {name: 'serialization', summary: 'serialization benchmark'},
      {name: 'transform-wire', summary: 'the transform wire benchmark'},
      {name: 'smoke', summary: 'smoke the benchmark image'},
      {name: 'prep', summary: 'build the engine + the Linux ELFs the image mounts'},
      {name: 'build', args: '[name]', summary: 'build the lanes'},
      {name: 'capture-env', summary: 'record the machine the numbers came from'},
      {name: 'shell', summary: 'debug shell inside the benchmark container'},
      {name: 'clean', summary: 'remove the benchmark run artifacts (the image itself: container clean website)', ...noBuild},
      {
        name: 'servers',
        args: '<verb>',
        summary: 'the mion HTTP server benchmarks (own image)',
        flags: [['--quick', 'the short run']],
        commands: [
          {name: 'one', args: '<app>', summary: 'one app'},
          {name: 'suite', args: '<key>', summary: 'one suite'},
          {name: 'sweep', summary: 'every app'},
          {name: 'build', summary: 'build the mion app lanes'},
          {name: 'prep', summary: 'build the engine + the Linux ELF the image mounts'},
          {name: 'website', summary: 'the website subset'},
          {name: 'gen-docs', summary: 'regenerate the server benchmark docs', ...noBuild},
          {name: 'aggregate', summary: 'aggregate recorded runs', ...noBuild},
          {name: 'shell', summary: 'debug shell inside the mion-bench container'},
          {name: 'build-image', summary: 'build the mion-bench image', ...noBuild},
          {name: 'login', summary: 'log in to GHCR', ...noBuild},
          {name: 'push', summary: 'push the mion-bench image', ...noBuild},
          {name: 'pull', summary: 'pull the mion-bench image', ...noBuild},
          {name: 'clean', summary: 'remove the run artifacts', ...noBuild},
        ],
      },
    ],
  },
  release: {
    summary: 'npm publish + the site build (CI stages to npm; a maintainer approves with 2FA)',
    bareBuild: false,
    commands: [
      // preflight (and so the chain) opens with a hard clean that wipes bin/ and the
      // dists, then builds them itself: gating it first would build to throw away.
      {
        name: 'all',
        summary: 'the chain: preflight -> npm publish -> site build (bare `release` only prints this help)',
        flags: [
          ['--preflight-only', 'stop after preflight'],
          ['--no-website', 'skip the site build'],
          ['--dry-run', 'print the plan, run nothing'],
        ],
        ...noBuild,
      },
      {name: 'preflight', summary: 'fresh install, engine build, then the full lint + test run before a publish', ...noBuild},
      {name: 'npm', summary: 'the interactive npm publish (bumps, commits, tags)', ...noBuild},
      {name: 'website', summary: 'the full site build (generate)'},
      {name: 'bump', args: '<version>', summary: 'bump the lockstep version', ...noBuild},
      {name: 'dists', summary: 'build every package dist'},
      {name: 'binaries', summary: 'cross-build the per-platform resolver binaries', ...noBuild},
      {name: 'pack', summary: 'pack the tarballs from the built dists', ...noBuild},
      {name: 'tarballs', summary: 'stage-publish the packed tarballs (the pnpm-free CI publish job)', ...noBuild},
      {name: 'unpublish', summary: 'unpublish one version', ...noBuild},
      {
        name: 'stage-approve',
        summary: 'approve the staged packages (one 2FA prompt, leaves first), then dispatch the site deploy',
        flags: [
          ['--dry-run', 'print what would be approved'],
          ['--no-deploy', 'skip the site deploy dispatch'],
          ['--deploy-only', 'only dispatch the site deploy'],
        ],
        ...noBuild,
      },
      {name: 'verify-live', summary: "deploy guard: fail unless the tree's version is LIVE on npm (all packages)", ...noBuild},
      {
        name: 'check-drizzle-versions',
        summary: 'guard: the drizzle package versions, peer ranges and manifests match the installed drizzle-orm',
        flags: [['--changes', 'also list which packages are due a patch bump']],
        ...noBuild,
      },
      {
        name: 'manual-publish',
        summary: 'first-publish bootstrap: build + npm login + publish everything LIVE (resumable)',
        flags: [
          ['--skip-build', 'publish what is built'],
          ['--dry-run', 'print the plan'],
          ['--yes', 'no prompts'],
        ],
        ...noBuild,
      },
      {
        name: 'e2e',
        summary: 'pre-publish e2e: containerized verdaccio + the bundler matrix + the mion consumer lanes + host smoke',
        build: (args) => e2ePacksItself(args),
        flags: [
          ['--backend <container|host-npx|npm>', 'where the registry runs; npm = the LIVE packages (post-publish)'],
          ['--pack', 'repack the tarballs first'],
          ['--registry <url>', 'registry for --backend npm'],
          ['--version <v>', 'version for --backend npm'],
          ['--no-matrix', 'skip the bundler matrix'],
          ['--no-mion', 'skip the @mionjs/* consumer + bun lanes'],
        ],
      },
      {
        name: 'drizzle-e2e',
        summary: "drizzle's own suites translated onto the slim packages, run against real postgres / mysql / sqlite",
        flags: [['--dialect <pg|mysql|sqlite|d1|durable>', 'one lane (default: all)']],
        build: (args) => drizzleE2ePacksItself(args),
      },
    ],
  },
  container: {
    summary: 'the podman images: website, e2e, mion-bench, drizzle-pg, drizzle-mysql, drizzle-sqlite, drizzle-cloudflare',
    ...noBuild,
    commands: [
      {name: 'build-image', args: '[target]', summary: 'build one image, or ALL SEVEN'},
      {name: 'ensure', args: '[target]', summary: 'pull or build the image if missing'},
      {name: 'login', summary: 'log in to GHCR'},
      {name: 'push', args: '[target]', summary: 'push one image, or ALL SEVEN'},
      {name: 'pull', args: '[target]', summary: 'pull one image, or ALL SEVEN'},
      {name: 'lock', summary: 'refresh the image lock file'},
      {name: 'clean', args: '[target]', summary: 'remove one image, or ALL SEVEN'},
    ],
  },
  env: {
    summary: 'env var status (bare = every known var + the .env.sample mirror check)',
    flags: [['--create-env', 'create .env from .env.sample if it does not exist']],
    ...noBuild,
    commands: [
      {name: 'push-image', summary: 'verify the vars `container push` needs (GHCR token)'},
      {name: 'publish-npm', summary: 'info: NPM_TOKEN is for the local publish + the CI stage secret'},
      {name: 'deploy-website', summary: 'info: the Cloudflare secrets live in GitHub, not .env'},
    ],
  },
};

// Top-level verbs that are not areas.
export const TOP = [
  {name: 'verify', summary: 'build if stale, then lint + typecheck + format check'},
  {name: 'fmt', summary: 'format (oxfmt + prettier + gofmt)', flags: [['--check', 'read-only']], ...noBuild},
  {
    name: 'clean',
    summary: 'hard clean: dists, caches, run artifacts + node_modules',
    flags: [
      ['--keep-deps', 'keep node_modules'],
      ['--dry-run', 'list, delete nothing'],
      ['--deep', 'reinstall afterwards'],
    ],
    ...noBuild,
  },
];

// ── lookup ──────────────────────────────────────────────────────────────────

const flagWord = (spec) => spec.split(' ')[0];
const flagTakesValue = (spec) => spec.includes(' ');

// The first positional after the area's own flags (a valued area flag swallows the
// token after it, so `<area> --flag value <command>` still finds the command).
function firstPositional(area, args) {
  const valued = new Set((area?.flags ?? []).filter(([spec]) => flagTakesValue(spec)).map(([spec]) => flagWord(spec)));
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (valued.has(arg)) {
      i++;
      continue;
    }
    if (arg.startsWith('-')) continue;
    return {sub: arg, rest: args.slice(i + 1)};
  }
  return {sub: undefined, rest: []};
}

export const commandNames = (area) => (AREAS[area]?.commands ?? []).map((row) => row.name);
export const lookup = (area, sub) => (AREAS[area]?.commands ?? []).find((row) => row.name === sub);

// The usage line for an area, built from the rows so it cannot disagree with them.
export const usage = (area) => `usage: ${CLI} ${area} <${commandNames(area).join('|')}>  (run \`pnpm ${CLI} ${area} --help\` for the flags)`;

// Does this invocation need the engine built first? An unknown area or command
// answers false: the dispatchers look every sub up in this table before running
// it, so an unregistered word can only end in the usage error, and building
// first would just make a typo cost a link. A bare area builds unless it says
// `bareBuild: false`; a nested verb list (bench servers) inherits its parent.
export function needsEngine(verb, rest = []) {
  if (verb === undefined || isHelpFlag(verb)) return false;
  if (rest.some(isHelpFlag)) return false;
  const top = TOP.find((row) => row.name === verb);
  if (top) return rowNeedsEngine(top, rest, true);
  const area = AREAS[verb];
  if (!area) return false;
  if (area.build === false) return false;
  return commandsNeedEngine(area, area.commands, rest, true);
}

function commandsNeedEngine(scope, commands, args, fallback) {
  const {sub, rest} = firstPositional(scope, args);
  if (sub === undefined) return scope.bareBuild === false ? false : fallback;
  const row = commands.find((candidate) => candidate.name === sub);
  if (!row) return false;
  if (row.commands) return commandsNeedEngine(row, row.commands, rest, rowNeedsEngine(row, rest, true));
  return rowNeedsEngine(row, rest, true);
}

function rowNeedsEngine(row, args, fallback) {
  if (row.build === false) return false;
  if (typeof row.build === 'function') return Boolean(row.build(args));
  return fallback;
}

// ── help ────────────────────────────────────────────────────────────────────

// Wrap `text` to `width` columns, continuation lines indented by `indent`.
function wrap(text, width, indent) {
  const words = text.split(' ').flatMap((word) => splitLong(word, width));
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && line.length + 1 + word.length > width) {
      lines.push(line);
      line = word;
    } else line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.map((row, i) => (i === 0 ? row : `${' '.repeat(indent)}${row}`)).join('\n');
}

// A token wider than the line (the fuzz suite list) breaks after a '|'.
function splitLong(word, width) {
  if (word.length <= width || !word.includes('|')) return [word];
  const parts = [];
  let current = '';
  for (const piece of word.split('|')) {
    const next = current ? `${current}|${piece}` : piece;
    if (current && next.length > width) {
      parts.push(`${current}|`);
      current = piece;
    } else current = next;
  }
  if (current) parts.push(current);
  return parts;
}

const label = (row) => (row.args ? `${row.name} ${row.args}` : row.name);
// The name column of a listing: wide enough for every label and every flag spec
// (flags sit 4 deeper, nested verbs 4 deeper again), capped so one long label
// cannot push every summary to the right; a wider label overflows onto its own line.
function nameColumn(rows, flags = [], withFlags = true, depth = 0) {
  const widths = rows.map((row) => label(row).length + depth * 4);
  if (withFlags) {
    for (const [spec] of flags) widths.push(spec.length + 4 + depth * 4);
    for (const row of rows) {
      for (const [spec] of row.flags ?? []) widths.push(spec.length + 4 + depth * 4);
      if (row.commands) widths.push(nameColumn(row.commands, row.flags, true, depth + 1));
    }
  }
  return Math.min(NAME_COL_CAP, Math.max(...widths, 1));
}

// One `  name args   summary` line (+ its flag lines when `withFlags`). A label
// wider than the column pushes the summary to its own line under it.
function renderRow(row, col, withFlags, indent = 2) {
  const textCol = indent + col + 2;
  const width = Math.max(SUMMARY_MIN, HELP_WIDTH - textCol);
  const out = [];
  const name = label(row);
  if (name.length > col) out.push(`${' '.repeat(indent)}${name}`, `${' '.repeat(textCol)}${wrap(row.summary, width, textCol)}`);
  else out.push(`${' '.repeat(indent)}${name.padEnd(col)}  ${wrap(row.summary, width, textCol)}`);
  if (withFlags) for (const [spec, help] of row.flags ?? []) out.push(renderFlag(spec, help, col, indent));
  if (withFlags && row.commands) for (const nested of row.commands) out.push(renderRow(nested, col - 4, true, indent + 4));
  return out.join('\n');
}

function renderFlag(spec, help, col, indent) {
  const flagIndent = indent + 4;
  const textCol = indent + col + 2;
  const width = Math.max(SUMMARY_MIN, HELP_WIDTH - textCol);
  const pad = Math.max(1, textCol - flagIndent - spec.length);
  if (spec.length + flagIndent >= textCol) return `${' '.repeat(flagIndent)}${spec}\n${' '.repeat(textCol)}${wrap(help, width, textCol)}`;
  return `${' '.repeat(flagIndent)}${spec}${' '.repeat(pad)}${wrap(help, width, textCol)}`;
}

function renderArea(name, area, withFlags) {
  const rows = area.commands;
  const col = nameColumn(rows, area.flags, withFlags);
  const out = [`${name.padEnd(9)} ${wrap(area.summary, HELP_WIDTH - 10, 10)}`];
  if (withFlags) for (const [spec, help] of area.flags ?? []) out.push(renderFlag(spec, help, col, 2));
  for (const row of rows) out.push(renderRow(row, col, withFlags));
  return out.join('\n');
}

const BANNER = `${CLI} — the mion monorepo dev CLI  (run as: pnpm ${CLI} <area> <command>)`;

// No area: every area, one line per command, no flags. With an area: that area
// only, each command followed by one indented line per flag.
export function renderHelp(area) {
  if (area) {
    if (!AREAS[area]) throw new Error(`unknown area '${area}'`);
    return `${renderArea(area, AREAS[area], true)}\n`;
  }
  const sections = Object.entries(AREAS).map(([name, def]) => renderArea(name, def, false));
  const col = nameColumn(TOP);
  const top = TOP.map((row) => renderRow(row, col, false, 0)).join('\n');
  return `${BANNER}\n\n${sections.join('\n\n')}\n\n${top}\n\nEvery command builds bin/mion + the dev dists first when it needs them.\nFlags: pnpm ${CLI} <area> --help\n`;
}
