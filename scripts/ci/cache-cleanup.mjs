// For cache-cleanup.yml. A pull request's caches restore only from that pull request, so once it closes
// they are dead weight (a Go build cache is ~2 GB), except the lane green markers: read from any ref,
// a merged pull request's markers let main skip the lanes the merge did not change.
// Usage: node scripts/ci/cache-cleanup.mjs --closed-ref <ref> | --trim  [--dry-run]
import {capture, die, note, reportCliError} from '../lib/proc.mjs';

const MARKER = 'mion-lane-green-';
// Entries on main kept per family, newest first; a run that needs an older one rebuilds it.
export const KEEP_ON_MAIN = {'mion-go-bins-': 20, 'mion-release-bins-': 10, 'mion-vitest-passed-': 5};
const MAIN = 'refs/heads/main';

export function planDeletions(caches, {closedRef} = {}) {
  if (closedRef) return caches.filter((cache) => cache.ref === closedRef && !cache.key.startsWith(MARKER));
  const doomed = [];
  for (const [prefix, keep] of Object.entries(KEEP_ON_MAIN)) {
    const family = caches.filter((cache) => cache.ref === MAIN && cache.key.startsWith(prefix));
    family.sort((a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt));
    doomed.push(...family.slice(keep));
  }
  return doomed;
}

function listCaches(ref) {
  const args = ['cache', 'list', '--limit', '1000', '--json', 'id,key,ref,lastAccessedAt,sizeInBytes'];
  if (ref) args.push('--ref', ref);
  const listed = capture('gh', args);
  if (listed.status !== 0) die(`cache-cleanup: gh cache list failed: ${listed.stderr.trim()}`);
  return JSON.parse(listed.stdout);
}

export function main(argv) {
  const at = argv.indexOf('--closed-ref');
  const closedRef = at === -1 ? '' : argv[at + 1];
  if (at !== -1 && !closedRef) die('cache-cleanup: --closed-ref needs a ref', 2);
  if (!closedRef && !argv.includes('--trim')) die('cache-cleanup: pass --closed-ref <ref> or --trim', 2);
  const dryRun = argv.includes('--dry-run');
  const doomed = planDeletions(listCaches(closedRef), {closedRef});
  const megabytes = Math.round(doomed.reduce((sum, cache) => sum + (cache.sizeInBytes ?? 0), 0) / 1e6);
  note(`cache-cleanup: ${doomed.length} cache(s), ${megabytes} MB, to delete${dryRun ? ' (dry run)' : ''}`);
  for (const cache of doomed) {
    console.log(`  ${cache.key}`);
    if (dryRun) continue;
    // Never fails the sweep: another run may have deleted the cache first.
    const deleted = capture('gh', ['cache', 'delete', String(cache.id)]);
    if (deleted.status !== 0) note(`cache-cleanup: could not delete ${cache.key}: ${deleted.stderr.trim()}`);
  }
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
