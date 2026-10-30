// A website-deploy.yml dry run must never reach the live site yet run everything short of the upload;
// the steps it skips and adds are pinned so a new deploy step cannot slip in ungated.
import {describe, it, expect} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const workflow = readFileSync(path.join(REPO_ROOT, '.github/workflows/website-deploy.yml'), 'utf8');

const steps = new Map(
  workflow
    .split(/\n(?=\s+- (?:name|uses):)/)
    .map((block) => [/- name: (.+)/.exec(block)?.[1]?.trim() ?? '', block] as const)
    .filter(([name]) => name)
);
const step = (name: string): string => {
  const body = steps.get(name);
  if (!body) throw new Error(`website-deploy.yml has no step named "${name}"`);
  return body;
};

describe('website-deploy dry run', () => {
  it('takes a boolean dry_run input that defaults to a real deploy', () => {
    expect(workflow).toMatch(/dry_run:\n(?:\s+.+\n)*?\s+type: boolean\n\s+default: false\n/);
  });

  it('skips the live-version guard and the deploy on a dry run', () => {
    expect(step('Verify the deploy target is the live npm release (abort otherwise)')).toContain('if: ${{ !inputs.dry_run }}');
    expect(step('Deploy the site to Cloudflare Pages (mion.io)')).toContain('if: ${{ !inputs.dry_run }}');
  });

  it('checks the Cloudflare credentials read-only instead, against the same project', () => {
    const check = step('Check the Cloudflare credentials reach the Pages project (dry run)');
    expect(check).toContain('if: ${{ inputs.dry_run }}');
    expect(check).toContain('run: pnpm dlx wrangler@4.134.0 pages deployment list --project-name="$CLOUDFLARE_PAGES_PROJECT"');
    expect(check).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(check).toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
  });

  it('runs every wrangler deploy only on a real run', () => {
    const deploys = [...steps.values()].filter((body) => /pages deploy\b/.test(body));
    expect(deploys.length).toBe(1);
    const [deploy] = deploys;
    expect(deploy).toContain('if: ${{ !inputs.dry_run }}');
    expect(deploy).toContain(
      'run: pnpm dlx wrangler@4.134.0 pages deploy container/website/.output/public --project-name="$CLOUDFLARE_PAGES_PROJECT" --branch=prod'
    );
    expect(deploy).toContain('CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}');
    expect(deploy).toContain('CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}');
  });

  // wrangler-action runs `pnpm add`, which pnpm refuses at a workspace root (ERR_PNPM_ADDING_TO_ROOT).
  it('runs one pinned wrangler through pnpm dlx, never wrangler-action', () => {
    expect(workflow).not.toContain('cloudflare/wrangler-action');
    const pins = new Set(workflow.match(/run: pnpm dlx (wrangler@\d+\.\d+\.\d+) pages /g)?.map((run) => run.split(' ')[3]));
    expect(workflow.match(/pnpm dlx wrangler@/g)?.length).toBe(2);
    expect(pins.size).toBe(1);
  });

  it('still builds and checks the site on a dry run', () => {
    for (const name of ['Build binary + benchmarks + static site', 'Check the built site']) {
      expect(step(name)).not.toMatch(/^\s+if:/m);
    }
  });

  it('queues a dry run apart, so it never cancels a real deploy waiting in the live queue', () => {
    expect(workflow).toContain("group: website-deploy-${{ inputs.dry_run && 'dry-run' || 'prod' }}");
    expect(workflow).toContain('cancel-in-progress: false');
  });

  it('keeps the ref guard on a dry run, so the production secrets stay on main and prod', () => {
    expect(step('Refuse to deploy from a ref that is not main or prod')).toContain(
      "if: github.ref_name != 'main' && github.ref_name != 'prod'"
    );
  });
});

// reuse_benchmarks ships the last deploy's bench-data/ instead of re-running the benchmarks, so a docs-only
// deploy takes minutes; a full deploy must stay the default and nothing may run a benchmark when it is on.
describe('website-deploy reuse_benchmarks', () => {
  const REUSE = 'if: ${{ inputs.reuse_benchmarks }}';
  const FULL = 'if: ${{ !inputs.reuse_benchmarks }}';

  it('takes a boolean reuse_benchmarks input that defaults to running the benchmarks', () => {
    expect(workflow).toMatch(/reuse_benchmarks:\n(?:\s+.+\n)*?\s+type: boolean\n\s+default: false\n/);
  });

  it('copies bench-data/ from the newest unexpired deploy artifact, only when asked', () => {
    const find = step("Find the last deploy's benchmark data (reuse_benchmarks)");
    expect(find).toContain(REUSE);
    expect(find).toContain('actions/artifacts?name=website-output-deploy');
    expect(find).toContain('select(.expired | not)');
    const download = step("Download the last deploy's site (reuse_benchmarks)");
    expect(download).toContain(REUSE);
    expect(download).toContain('name: website-output-deploy');
    expect(download).toContain('run-id: ${{ steps.last-bench.outputs.run-id }}');
    expect(step('Reuse its benchmark data (reuse_benchmarks)')).toContain(REUSE);
    // the artifact the next reuse reads is the one every deploy uploads
    expect(step('Upload static artifact')).toContain('name: website-output-deploy');
    expect(workflow).toMatch(/permissions:\n\s+contents: read\n\s+packages: read\n(?:\s+#.*\n)*\s+actions: read\n/);
  });

  it('builds with --no-bench only when reusing, and runs no benchmark then', () => {
    expect(step('Build binary + benchmarks + static site')).toContain(
      "run: pnpm miondevx website build ${{ inputs.reuse_benchmarks && '--no-bench' || '' }}"
    );
    expect(step('Pull the prebuilt mion-bench image (CI never builds it)')).toContain(FULL);
    expect(step('Engine-branch throughput check (counter inversion, node + bun)')).toContain(FULL);
  });
});
