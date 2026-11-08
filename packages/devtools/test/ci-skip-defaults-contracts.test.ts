// The `skip-defaults` label skips every heavy ci.yml job (HEAVY below) on one PR, only if BOTH halves hold: the trigger
// fires on label changes (or the label waits for the next push), and every heavy job's `if:` reads it (or one job keeps
// running). The light jobs (`lanes`, `commitlint`) must NOT read it: they cost seconds and keep commit messages gated.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const ci = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const LABEL = 'skip-defaults';
const GUARD = `!contains(fromJSON(needs.lanes.outputs.labels), '${LABEL}')`;

/** The `if:` line of one job, or undefined when the job has none. */
function jobCondition(job: string): string | undefined {
  const at = ci.indexOf(`\n  ${job}:\n`);
  expect(at, `job ${job} not found`).toBeGreaterThan(-1);
  const next = ci.indexOf('\n  ', ci.indexOf('\n    steps:', at));
  const body = ci.slice(at, next === -1 ? undefined : next);
  return /^    if: (.*)$/m.exec(body)?.[1];
}

// Every job that sets up a runner for real work; the `*-green` record jobs follow from them.
const HEAVY = [
  'go-build',
  'go-checks',
  'go-suite',
  'js-fuzz-sweep',
  'js-fuzz-timeboxed',
  'js-static',
  'js-suite',
  'js-serial',
  'smoke',
];

describe('the skip-defaults label', () => {
  it('takes effect when added or removed, not only on the next push', () => {
    const types = /^  pull_request:\n(?:    .*\n)*?    types: \[([^\]]*)\]/m.exec(ci)?.[1] ?? '';
    const listed = types.split(',').map((type) => type.trim());
    expect(listed).toContain('labeled');
    expect(listed).toContain('unlabeled');
    // The default set stays, or the workflow stops running on new commits.
    for (const type of ['opened', 'synchronize', 'reopened']) expect(listed).toContain(type);
  });

  it('skips every heavy job', () => {
    for (const job of HEAVY) expect(jobCondition(job), job).toContain(GUARD);
    const jobs = [...ci.matchAll(/^ {2}([\w-]+):\n {4}name: /gm)].map((match) => match[1]);
    const unguarded = jobs.filter((job) => !HEAVY.includes(job) && !job.endsWith('-green') && !job.endsWith('-wait'));
    expect(unguarded.sort(), 'a job that is neither heavy, a record job nor a waiter').toEqual(['commitlint', 'lanes']);
  });

  it('never skips the light jobs', () => {
    for (const job of ['lanes', 'commitlint']) expect(jobCondition(job) ?? '', job).not.toContain(LABEL);
  });

  it('is a guard on the existing content gate, not a replacement for it', () => {
    // `(a || b) && !label`: the parentheses keep the label from binding to `b` alone.
    const waited = (job: string) => `fromJSON\\(needs\\.${job}-wait\\.outputs\\.lanes \\|\\| needs\\.lanes\\.outputs\\.lanes\\)`;
    const guarded = (condition: string) =>
      new RegExp(`^\\$\\{\\{ !cancelled\\(\\) && needs\\.lanes\\.result == 'success' && ${condition} && !contains`);
    expect(jobCondition('go-checks')).toMatch(
      guarded(`\\(${waited('go-checks')}\\['go-static'\\]\\.run \\|\\| ${waited('go-checks')}\\['go-tools'\\]\\.run\\)`)
    );
    expect(jobCondition('go-suite')).toMatch(guarded(`${waited('go-suite')}\\.go\\.run`));
    for (const item of ['sweep', 'timeboxed'])
      expect(jobCondition(`js-fuzz-${item}`)).toMatch(
        guarded(
          `\\(${waited('js-fuzz')}\\['js-fuzz'\\]\\.run && contains\\(${waited('js-fuzz')}\\['js-fuzz'\\]\\.runItems, '${item}'\\)\\)`
        )
      );
    expect(jobCondition('js-static')).toMatch(guarded(`\\(${waited('js-static')}\\['js-static'\\]\\.run\\)`));
    for (const job of ['js-suite', 'js-serial'])
      expect(jobCondition(job)).toMatch(guarded(`\\(${waited('js-suite')}\\.js\\.run\\)`));
    expect(jobCondition('smoke')).toMatch(guarded(`${waited('smoke')}\\.smoke\\.run`));
  });
});
