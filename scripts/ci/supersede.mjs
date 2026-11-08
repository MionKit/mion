// GitHub's concurrency cancel kills an older run even when the new commit changes nothing it reads. Instead, an
// older run whose live lanes all hash the same is kept and our jobs for those lanes wait for its markers.
// CI only: --plan runs in the ci-lanes action, --wait in the lane-wait workflow, --watch wraps the raw-lane steps.
import {spawn} from 'node:child_process';
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LANES, PR_PROOF, flagValues, greenKey, laneLive} from './lanes.mjs';
import {capture, die, noteErr, reportCliError} from '../lib/proc.mjs';

// The lanes and items a run is really running, keyed `lane` or `lane.item`, with the hash each one proves.
export function liveKeys({lanes, labels, baseRef}) {
  const live = new Map();
  for (const [name, verdict] of Object.entries(lanes)) {
    if (!verdict.run || !laneLive(name, {labels, baseRef})) continue;
    if (!LANES[name]?.items) live.set(name, verdict.hash);
    else for (const item of verdict.runItems ?? []) live.set(`${name}.${item}`, verdict.items[item].hash);
  }
  return live;
}

const hashOf = (lanes, key) => {
  const [name, item] = key.split('.');
  return item ? lanes[name]?.items?.[item]?.hash : lanes[name]?.hash;
};

// `ours` and each older `decision` are {lanes, labels, baseRef}; a run is kept only while one of our lanes waits on it.
// So a label turning our lanes off (skip-defaults) cancels it; a changed raw lane (a comment edit) reruns here instead.
export function supersede({ours, older}) {
  const lanes = structuredClone(ours.lanes);
  const ourLive = liveKeys(ours);
  const deferred = {};
  const keep = [];
  const cancel = [];
  const reasons = {};
  for (const {runId, decision} of [...older].sort((first, second) => first.runId - second.runId)) {
    const live = decision ? liveKeys(decision) : new Map();
    const changed = [...live].filter(([key, hash]) => hashOf(ours.lanes, key) !== hash).map(([key]) => key);
    const blocking = changed.filter((key) => LANES[key.split('.')[0]]?.hash !== 'raw');
    const waitedOn = [...live.keys()].filter((key) => ourLive.has(key) && deferred[key] === undefined && !changed.includes(key));
    const reason = !decision
      ? 'its gate has not decided yet'
      : blocking.length > 0
        ? `this commit changes ${blocking.join(', ')}`
        : waitedOn.length === 0
          ? 'nothing it runs is still needed here'
          : null;
    if (reason !== null) {
      cancel.push(runId);
      reasons[runId] = reason;
      continue;
    }
    keep.push(runId);
    for (const key of waitedOn) {
      const [name, item] = key.split('.');
      deferred[key] = runId;
      if (item) lanes[name].items[item].deferredTo = runId;
      // On an item lane this only marks that something waits, which is what starts the waiter.
      lanes[name].deferredTo ??= runId;
    }
  }
  return {keep, cancel, reasons, deferred, lanes};
}

// Any key proves its group, so on a pull request `js` also accepts the js-pr marker a partial js suite run saves.
export function deferredKeys(lanes, names, {pr}) {
  const groups = [];
  for (const name of names) {
    const verdict = lanes[name];
    if (!verdict?.deferredTo) continue;
    if (!LANES[name].items) groups.push({runId: verdict.deferredTo, keys: [greenKey(name, verdict.hash), ...(pr && PR_PROOF[name] ? [greenKey(PR_PROOF[name], verdict.hash)] : [])]});
    for (const [item, spec] of Object.entries(verdict.items ?? {})) if (spec.deferredTo) groups.push({runId: spec.deferredTo, keys: [greenKey(`${name}.${item}`, spec.hash)]});
  }
  return groups;
}

const FAILED = new Set(['failure', 'timed_out']);
// Every minute for the first ten, then every three: a two hour bench wait must not eat the token's hourly budget.
const pollMs = (waited) => (waited < 10 * 60_000 ? 60_000 : 180_000);

// `jobs` are the waiting job's name prefixes. Never cancels: the run may be proving lanes for other waiters.
// At the deadline it returns, since running the lane is the safe default.
export function waitForRun({groups, jobs, gh, sleep, now, deadline}) {
  const outcomes = groups.map(() => null);
  const started = now();
  const exists = (key) => {
    const listed = gh(['cache', 'list', '--key', key, '--limit', '1', '--json', 'key', '--jq', '.[].key']);
    return listed.status === 0 && listed.stdout.split('\n').includes(key);
  };
  for (;;) {
    const runs = new Map();
    const runState = (runId) => {
      if (!runs.has(runId)) {
        const viewed = gh(['run', 'view', String(runId), '--json', 'status,jobs']);
        let state = null;
        try {
          const run = viewed.status === 0 ? JSON.parse(viewed.stdout) : null;
          const failed = run?.jobs.some((job) => FAILED.has(job.conclusion) && jobs.some((prefix) => job.name.startsWith(prefix)));
          if (run) state = run.status === 'completed' ? 'finished' : failed ? 'failed' : null;
        } catch {
          // An unreadable answer is one more poll, never a verdict.
        }
        runs.set(runId, state);
      }
      return runs.get(runId);
    };
    groups.forEach((group, at) => {
      if (outcomes[at] !== null) return;
      const state = runState(group.runId);
      // Markers are checked even when the run ended: it may have saved the last one just before.
      outcomes[at] = group.keys.some(exists) ? 'proven' : state;
    });
    if (outcomes.every((outcome) => outcome !== null)) return outcomes;
    const interval = pollMs(now() - started);
    if (now() + interval > deadline) return outcomes.map((outcome) => outcome ?? 'deadline');
    sleep(interval);
  }
}

// A newer run takes a lane over by running it under another hash: a lane it defers to us hashes the same.
export function takenOver({ours, newer, names}) {
  const taken = new Map();
  for (const {runId, decision} of newer) {
    if (!decision) continue;
    for (const [key, hash] of liveKeys(decision)) {
      const name = key.split('.')[0];
      if (names.includes(name) && !taken.has(name) && hashOf(ours, key) !== hash) taken.set(name, runId);
    }
  }
  return taken;
}

// Filtered by repository and PR so a same-named branch in a fork or another PR is never touched.
export function listRuns({gh, env}) {
  const workflow = (env.GITHUB_WORKFLOW_REF ?? '').split('@')[0].split('/').pop();
  const pr = /^refs\/pull\/(\d+)\//.exec(env.GITHUB_REF ?? '')?.[1];
  const branch = env.GITHUB_HEAD_REF || env.GITHUB_REF_NAME;
  const listed = gh(['api', '-X', 'GET', `repos/${env.GITHUB_REPOSITORY}/actions/workflows/${workflow}/runs`, '-f', `branch=${branch}`, '-f', `event=${env.GITHUB_EVENT_NAME}`, '-F', 'per_page=30']);
  try {
    const runs = listed.status === 0 ? JSON.parse(listed.stdout).workflow_runs : null;
    if (!Array.isArray(runs)) return null;
    return runs.filter(
      (run) => run.head_repository?.full_name === env.GITHUB_REPOSITORY && (!pr || run.pull_requests?.some((pull) => String(pull.number) === pr))
    );
  } catch {
    return null;
  }
}

// Cached on disk, so the watched steps of a job download each decision once.
export function readDecision({gh, env, dir, runId}) {
  const target = join(dir, String(runId));
  const file = join(target, 'decision.json');
  const parse = () => {
    try {
      const decision = JSON.parse(readFileSync(file, 'utf8'));
      return typeof decision?.lanes === 'object' && decision.lanes !== null && !Array.isArray(decision.lanes) ? decision : null;
    } catch {
      return null;
    }
  };
  if (existsSync(file)) return parse();
  gh(['run', 'download', String(runId), '--repo', env.GITHUB_REPOSITORY, '--name', 'lane-decision', '--dir', target]);
  return parse();
}

export function olderRuns({gh, env, dir}) {
  const runs = listRuns({gh, env});
  if (runs === null) {
    console.log('::warning::could not list the older runs, so none is kept or cancelled');
    return [];
  }
  return runs
    .filter((run) => run.status !== 'completed' && run.id < Number(env.GITHUB_RUN_ID))
    .map((run) => ({runId: run.id, decision: readDecision({gh, env, dir, runId: run.id})}));
}

// A cancelled run took nothing over, and a finished run without a decision never gets one: skip both.
export function newerDecisions({gh, env, dir}) {
  const newer = (listRuns({gh, env}) ?? []).filter((run) => run.id > Number(env.GITHUB_RUN_ID) && run.conclusion !== 'cancelled');
  return newer.flatMap((run) => {
    const gaveUp = join(dir, `${run.id}.none`);
    if (existsSync(gaveUp)) return [];
    const decision = readDecision({gh, env, dir, runId: run.id});
    if (!decision && run.status === 'completed') writeFileSync(gaveUp, '');
    return [{runId: run.id, decision}];
  });
}

// Own process group, so a takeover can stop everything the command started.
export function watchStep({command, names, check, pollMs}) {
  return new Promise((resolve) => {
    const child = spawn(command[0], command.slice(1), {stdio: 'inherit', detached: true});
    let timer = null;
    let taken = null;
    const signalGroup = (signal) => {
      try {
        process.kill(-child.pid, signal);
      } catch {
        // The group already exited.
      }
    };
    process.on('SIGINT', signalGroup).on('SIGTERM', signalGroup);
    const poll = () => {
      let lanes = new Map();
      try {
        lanes = check();
      } catch {
        // Keep running: an unknown is never a takeover.
      }
      if (names.every((name) => lanes.has(name))) {
        taken = lanes;
        signalGroup('SIGTERM');
        timer = setTimeout(() => signalGroup('SIGKILL'), 10_000);
        return;
      }
      timer = setTimeout(poll, pollMs);
    };
    if (check) timer = setTimeout(poll, pollMs);
    const finish = (code, signal) => {
      clearTimeout(timer);
      process.off('SIGINT', signalGroup).off('SIGTERM', signalGroup);
      // The direct child may exit on SIGTERM while something it started ignores it.
      if (taken) signalGroup('SIGKILL');
      resolve({code, signal, taken});
    };
    child.on('error', () => finish(127, null));
    child.on('exit', finish);
  });
}

// `--watch <lane…> -- <command…>`: the command is a step that proves those lanes.
async function watchMain(args, {gh, env, pollMs}) {
  const names = flagValues(args, '--watch');
  const command = args.slice(args.indexOf('--') + 1);
  if (names.length === 0 || !args.includes('--') || command.length === 0) die('--watch needs <lane…> -- <command…>');
  const already = (env.MION_TAKEN_OVER ?? '').split(' ').filter(Boolean);
  if (names.every((name) => already.includes(name))) return console.log(`skipped: a newer run re-runs ${names.join(', ')}`);
  let check = null;
  if (env.GITHUB_EVENT_NAME === 'pull_request') {
    const ours = JSON.parse(env.MION_LANES);
    const dir = join(env.RUNNER_TEMP ?? tmpdir(), 'lane-takeover');
    mkdirSync(dir, {recursive: true});
    check = () => takenOver({ours, newer: newerDecisions({gh, env, dir}), names});
  }
  const {code, signal, taken} = await watchStep({command, names, check, pollMs});
  if (!taken) {
    process.exitCode = code ?? (signal ? 1 : 0);
    return;
  }
  const runs = [...new Set(taken.values())].join(', ');
  const note = `stopped: newer run ${runs} re-runs ${names.join(', ')}, so this run saves no marker for it`;
  console.log(note);
  appendFileSync(env.GITHUB_ENV, `MION_TAKEN_OVER=${[...already, ...names].join(' ')}\n`);
  appendFileSync(env.GITHUB_STEP_SUMMARY, `${note}\n`);
}

const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));
const ghCli = (args) => capture('gh', args);

// Tests pass a fake `gh`, their own env and a poll of a few milliseconds.
export function main(args, {gh = ghCli, env = process.env, pollMs = 60_000} = {}) {
  if (args.includes('--watch')) return watchMain(args, {gh, env, pollMs});
  const decisionFile = flagValues(args, '--decision')[0];
  if (!decisionFile) die('--decision <file> is required');
  if (args.includes('--wait')) {
    const names = flagValues(args, '--lanes');
    const groups = deferredKeys(readJson(decisionFile), names, {pr: args.includes('--pr')});
    if (groups.length === 0) return console.log(`no lane of ${names.join(' ')} waits on an older run`);
    const jobs = (flagValues(args, '--jobs')[0] ?? '').split('|').filter(Boolean);
    const minutes = Number(flagValues(args, '--timeout')[0]);
    if (jobs.length === 0 || !(minutes > 0)) die('--wait needs --jobs and --timeout');
    const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
    const outcomes = waitForRun({groups, jobs, gh, sleep, now: Date.now, deadline: Date.now() + minutes * 60_000});
    return groups.forEach((group, at) => console.log(`run ${group.runId}, ${group.keys[0]}: ${outcomes[at]}`));
  }
  if (!args.includes('--plan')) die('pass --plan or --wait');
  const out = flagValues(args, '--out')[0];
  const dir = flagValues(args, '--older-dir')[0];
  if (!out || !dir) die('--plan needs --out <file> and --older-dir <dir>');
  const plan = supersede({ours: readJson(decisionFile), older: olderRuns({gh, env, dir})});
  const waitingOn = (runId) => Object.keys(plan.deferred).filter((key) => plan.deferred[key] === runId).join(', ');
  for (const runId of plan.cancel) noteErr(`cancel run ${runId}: ${plan.reasons[runId]}`);
  for (const runId of plan.keep) noteErr(`keep run ${runId}; these wait on it: ${waitingOn(runId)}`);
  writeFileSync(out, JSON.stringify(plan.lanes));
  if (!args.includes('--github')) return;

  appendFileSync(env.GITHUB_OUTPUT, `cancel=${plan.cancel.join(' ')}\n`);
  const rows = [...plan.cancel.map((runId) => `| ${runId} | cancel: ${plan.reasons[runId]} | |`), ...plan.keep.map((runId) => `| ${runId} | keep | ${waitingOn(runId)} |`)];
  if (rows.length > 0) appendFileSync(env.GITHUB_STEP_SUMMARY, ['### Older runs', '', '| run | verdict | lanes waiting on it |', '| --- | --- | --- |', ...rows, ''].join('\n'));
}

if (import.meta.main) {
  try {
    await main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
