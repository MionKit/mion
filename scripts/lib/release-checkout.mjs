// release-checkout.mjs — is this checkout at the version prod released?
//
// stage-approve reads the version to approve from version.json. Run from a
// checkout that missed the bump, it looks for the wrong version, finds nothing
// staged and blames npm. Comparing with origin's prod version.json names the
// real cause before anything else runs.

import {capture} from './proc.mjs';

// The version.json version on origin's prod branch, or {error} when it can't be read.
// Reads FETCH_HEAD, not origin/prod: a single-branch clone fetches prod without updating it.
export function remoteProdVersion(cwd) {
  const fetched = capture('git', ['fetch', '--quiet', 'origin', 'prod'], {cwd});
  if (fetched.status !== 0) return {error: `git fetch origin prod failed: ${fetched.stderr.trim() || `exit ${fetched.status}`}`};
  const shown = capture('git', ['show', 'FETCH_HEAD:version.json'], {cwd});
  if (shown.status !== 0) return {error: `could not read version.json on origin prod: ${shown.stderr.trim()}`};
  try {
    return {version: JSON.parse(shown.stdout).version};
  } catch {
    return {error: 'version.json on origin prod is not JSON'};
  }
}

// A message telling the user what to check out, or null when the checkout matches prod.
export function staleCheckoutMessage(localVersion, prodVersion) {
  if (localVersion === prodVersion) return null;
  return `this checkout is at ${localVersion} but prod released ${prodVersion}. Check out what prod released: git fetch origin prod && git checkout --detach FETCH_HEAD`;
}

// {die} for a checkout at another version, {warn} when prod can't be read, null to go on.
export function checkoutGuard(localVersion, cwd) {
  const prod = remoteProdVersion(cwd);
  if (prod.error) return {warn: `could not check this checkout against prod (${prod.error}).`};
  const stale = staleCheckoutMessage(localVersion, prod.version);
  return stale ? {die: stale} : null;
}
