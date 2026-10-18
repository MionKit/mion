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
    expect(step('Deploy the site to Cloudflare Pages (mion.pages.dev)')).toContain('if: ${{ !inputs.dry_run }}');
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
