// Contract tests for every PR label gate in .github/workflows/.
//
// Opening a PR with a label fires `opened` and `labeled` together, the concurrency
// group cancels one, and the `opened` payload carries no labels, so a gate reading
// the event payload can skip a labelled lane and still show green. Every gate reads
// the live labels the shared ci-lanes action emits instead.
import {describe, it, expect} from 'vitest';
import {chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel: string): string => readFileSync(path.join(REPO_ROOT, rel), 'utf8');
const WORKFLOW_DIR = '.github/workflows';
const workflows = readdirSync(path.join(REPO_ROOT, WORKFLOW_DIR))
  .filter((file) => file.endsWith('.yml'))
  .map((file) => ({file, text: read(`${WORKFLOW_DIR}/${file}`)}));
const action = read('.github/actions/ci-lanes/action.yml');
const LIVE_LABELS = 'fromJSON(needs.lanes.outputs.labels)';

/** Every job of a workflow, by name, with its body. */
function jobsOf(workflow: string): Map<string, string> {
  const body = workflow.slice(workflow.indexOf('\njobs:\n'));
  const parts = body.split(/^ {2}([a-z0-9-]+):\n/m).slice(1);
  const jobs = new Map<string, string>();
  for (let i = 0; i < parts.length; i += 2) jobs.set(parts[i], parts[i + 1]);
  return jobs;
}

/** The ci-lanes label step's script, extracted from the action. */
function labelScript(): string {
  const step = action.slice(action.indexOf('id: labels'));
  const script = /run: \|\n((?: {8}.*\n?)+)/.exec(step)?.[1] ?? '';
  return script.replace(/^ {8}/gm, '');
}

/** Runs the label script the way a composite `shell: bash` step does, with a fake `gh`. */
function runLabelScript(prNumber: string, ghScript: string): {status: number | null; output: string} {
  const dir = mkdtempSync(path.join(tmpdir(), 'label-gate-'));
  try {
    writeFileSync(path.join(dir, 'gh'), `#!/usr/bin/env bash\n${ghScript}\n`);
    chmodSync(path.join(dir, 'gh'), 0o755);
    const outputFile = path.join(dir, 'output');
    writeFileSync(outputFile, '');
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', labelScript()], {
      env: {
        PATH: `${dir}:${process.env.PATH}`,
        PR_NUMBER: prNumber,
        GITHUB_REPOSITORY: 'owner/repo',
        GITHUB_OUTPUT: outputFile,
      },
      encoding: 'utf8',
    });
    return {status: result.status, output: readFileSync(outputFile, 'utf8')};
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }
}

describe('PR label gates read the live labels', () => {
  it('no workflow or the ci-lanes action reads labels from the event payload', () => {
    for (const {file, text} of workflows) expect(text, file).not.toContain('github.event.pull_request.labels');
    expect(action).not.toContain('github.event.pull_request.labels');
  });

  it('every label-gated workflow has one, so the test cannot pass on nothing', () => {
    const gated = workflows.filter(({text}) => text.includes(LIVE_LABELS)).map(({file}) => file);
    expect(gated.sort()).toEqual(['ci.yml', 'drizzle-e2e.yml', 'pr-heavy.yml']);
  });

  for (const {file, text} of workflows.filter((workflow) => workflow.text.includes(LIVE_LABELS))) {
    const jobs = jobsOf(text);

    it(`${file}'s lanes job emits the labels and may read them`, () => {
      const lanes = jobs.get('lanes') ?? '';
      expect(lanes).toContain('uses: ./.github/actions/ci-lanes');
      expect(lanes).toContain('labels: ${{ steps.decide.outputs.labels }}');
      expect(lanes).toMatch(/permissions:\n(?: {6}.*\n)*? {6}pull-requests: read\n/);
    });

    it(`${file}: every job reading the labels needs the lanes job`, () => {
      for (const [name, body] of jobs) {
        if (!body.includes(LIVE_LABELS)) continue;
        const needs = /^ {4}needs: (.+)$/m.exec(body)?.[1] ?? '';
        expect(needs, `${file} job ${name}`).toMatch(/^(lanes|\[(.*\b)?lanes\b.*\])$/);
      }
    });
  }
});

describe('the ci-lanes label read', () => {
  it('is exposed as the action output `labels`', () => {
    expect(action).toMatch(/\n {2}labels:\n.*\n {4}value: \$\{\{ steps\.labels\.outputs\.labels \}\}\n/);
  });

  it('asks the API for the current labels of this pull request', () => {
    expect(labelScript()).toContain('gh pr view "$PR_NUMBER" --repo "$GITHUB_REPOSITORY" --json labels');
    expect(action).toContain('PR_NUMBER: ${{ github.event.pull_request.number }}');
  });

  it('emits the label names the API returns', () => {
    const run = runLabelScript('436', `echo '["bench","website"]'`);
    expect(run.status).toBe(0);
    expect(run.output).toBe('labels=["bench","website"]\n');
  });

  it('emits [] off a pull request, without calling the API', () => {
    const run = runLabelScript('', 'exit 1');
    expect(run.status).toBe(0);
    expect(run.output).toBe('labels=[]\n');
  });

  it('fails the gate when the API read fails, never emitting a guess', () => {
    const run = runLabelScript('436', 'echo boom >&2; exit 1');
    expect(run.status).not.toBe(0);
    expect(run.output).toBe('');
  });
});
