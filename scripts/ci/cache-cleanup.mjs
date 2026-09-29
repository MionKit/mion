// For cache-cleanup.yml. A pull request's caches restore only from that pull request, so once it closes
// they are dead weight (a Go build cache is ~2 GB), except the lane green markers: read from any ref,
// a merged pull request's markers let main skip the lanes the merge did not change.
// Usage: node scripts/ci/cache-cleanup.mjs --closed-ref <ref> | --trim  [--dry-run]
import {capture, die, note, reportCliError} from '../lib/proc.mjs';

const MARKER = 'mion-lane-green-';
// Newest entries kept per family on main; a run that needs an older one rebuilds it.
// No release-bins family: those are saved from pull requests alone.
export const KEEP_ON_MAIN = {'mion-go-bins-': 20};
const MAIN = 'refs/heads/main';

export function planDeletions(caches, {closedRef} = {}) {
  if (closedRef) return caches.filter((cache) => cache.ref === closedRef && !cache.key.startsWith(MARKER));
  const doomed = [];
  for (const [prefix, keep] of Object.entries(KEEP_ON_MAIN)) {
    const family = caches.filter((cache) => cache.ref === MAIN && cache.key.startsWith(prefix));
    family.sort((older, newer) => Date.parse(newer.lastAccessedAt) - Date.parse(older.lastAccessedAt));
    doomed.push(...family.slice(keep));
  }
  return doomed;
}

const runGh = (args) => capture('gh', args);

function listCaches(ref, gh) {
  const args = ['cache', 'list', '--limit', '1000', '--json', 'id,key,ref,lastAccessedAt,sizeInBytes'];
  if (ref) args.push('--ref', ref);
  const listed = gh(args);
  if (listed.status !== 0) die(`cache-cleanup: gh cache list failed: ${listed.stderr.trim()}`);
  return JSON.parse(listed.stdout);
}

// `gh` is injectable for the tests; it returns capture()'s {status, stdout, stderr}.
export function main(argv, {gh = runGh} = {}) {
  const at = argv.indexOf('--closed-ref');
  const closedRef = at === -1 ? '' : argv[at + 1];
  if (at !== -1 && (!closedRef || closedRef.startsWith('-'))) die('cache-cleanup: --closed-ref needs a ref', 2);
  if (!closedRef && !argv.includes('--trim')) die('cache-cleanup: pass --closed-ref <ref> or --trim', 2);
  const dryRun = argv.includes('--dry-run');
  const doomed = planDeletions(listCaches(closedRef, gh), {closedRef});
  const megabytes = Math.round(doomed.reduce((sum, cache) => sum + (cache.sizeInBytes ?? 0), 0) / 1e6);
  note(`cache-cleanup: ${doomed.length} cache(s), ${megabytes} MB, to delete${dryRun ? ' (dry run)' : ''}`);
  const failed = [];
  for (const cache of doomed) {
    console.log(`  ${cache.key}`);
    if (dryRun) continue;
    const deleted = gh(['cache', 'delete', String(cache.id)]);
    // Another run may have deleted it first; any other failure (a read-only token) must not read as done.
    if (deleted.status !== 0 && !/not found|could not find/i.test(deleted.stderr)) failed.push(`${cache.key}: ${deleted.stderr.trim()}`);
  }
  if (failed.length > 0) die(`cache-cleanup: ${failed.length} cache(s) not deleted:\n  ${failed.join('\n  ')}`);
}

if (import.meta.main) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    reportCliError(err);
  }
}
