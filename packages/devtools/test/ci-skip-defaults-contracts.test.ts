// Contract test for the `skip-defaults` label on ci.yml.
//
// The label lets a maintainer skip the three heavy ci jobs (go-fuzz, js-lint,
// smoke) on one PR. It only works if BOTH halves are in place: the trigger must
// fire on label changes (or the label does nothing until the next push), and
// every heavy job's `if:` must read it (or one job keeps running). The light
// jobs (`changes`, `commitlint`) must NOT read it: they cost seconds and keep the
// PR's commit messages gated.
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '../../..');
const ci = readFileSync(path.join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8');
const LABEL = 'skip-defaults';
const GUARD = `!contains(github.event.pull_request.labels.*.name, '${LABEL}')`;

/** The `if:` line of one job, or undefined when the job has none. */
function jobCondition(job: string): string | undefined {
  const at = ci.indexOf(`\n  ${job}:\n`);
  expect(at, `job ${job} not found`).toBeGreaterThan(-1);
  const next = ci.indexOf('\n  ', ci.indexOf('\n    steps:', at));
  const body = ci.slice(at, next === -1 ? undefined : next);
  return /^    if: (.*)$/m.exec(body)?.[1];
}

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
    for (const job of ['go-fuzz', 'js-lint', 'smoke']) expect(jobCondition(job), job).toContain(GUARD);
  });

  it('never skips the light jobs', () => {
    for (const job of ['changes', 'commitlint']) expect(jobCondition(job) ?? '', job).not.toContain(LABEL);
  });

  it('is a guard on the existing path gate, not a replacement for it', () => {
    // `(a || b) && !label`: the parentheses keep the label from binding to `b` alone.
    for (const job of ['go-fuzz', 'js-lint'])
      expect(jobCondition(job), job).toMatch(
        /^\(needs\.changes\.outputs\.\w+ == 'true' \|\| needs\.changes\.outputs\.\w+ == 'true'\) && !contains/
      );
    expect(jobCondition('smoke')).toMatch(/^needs\.changes\.outputs\.smoke == 'true' && !contains/);
  });
});
