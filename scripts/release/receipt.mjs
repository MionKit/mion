// receipt.mjs — the e2e receipt: proof that THESE tarball bytes passed the
// pre-publish e2e, so publishing can require it instead of trusting the operator
// to have run the gate.
//
// Why digests and not just "an e2e passed": the gate and the publish are separate
// verbs, so between them you can repack, switch branches, or publish an older
// tarballs/ — all of which leave a version-only receipt looking valid. The digest
// set is what ties the claim to the bytes.
//
// Why this is cheap: the tarballs are packed ONCE and travel as a CI artifact.
// release-gate.yml's build job packs and uploads them, its e2e job downloads that
// same artifact, and publish.yml (whose `gate` job CALLS release-gate.yml in the
// same run) downloads it again for the stage-publish. Nothing is rebuilt in
// between, so there is no reproducible-build question to answer here — the
// receipt just has to ride along, which is why the e2e job uploads it.

import {createHash} from 'node:crypto';
import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';

export const RECEIPT_NAME = '.e2e-receipt.json';

// A dotfile so the publishing verbs' `*.tgz` scans never mistake it for a package.
export const receiptPath = (tarballsDir) => join(tarballsDir, RECEIPT_NAME);

export function tarballFiles(tarballsDir) {
  if (!existsSync(tarballsDir)) return [];
  return readdirSync(tarballsDir)
    .filter((file) => file.endsWith('.tgz'))
    .sort();
}

// digestTarballs maps each packed file to its sha256. Sorted keys so two runs over
// the same directory produce byte-identical JSON.
export function digestTarballs(tarballsDir) {
  const digests = {};
  for (const file of tarballFiles(tarballsDir)) {
    digests[file] = createHash('sha256').update(readFileSync(join(tarballsDir, file))).digest('hex');
  }
  return digests;
}

// writeReceipt records what passed, over which bytes. `covered` says which halves
// of the lane actually ran, so a publish can print what it is trusting rather than
// implying the full matrix always ran.
export function writeReceipt(tarballsDir, {version, backend, covered, at}) {
  const receipt = {
    version,
    backend,
    covered,
    platform: `${process.platform}-${process.arch}`,
    at: at ?? new Date().toISOString(),
    tarballs: digestTarballs(tarballsDir),
  };
  writeFileSync(receiptPath(tarballsDir), `${JSON.stringify(receipt, null, 2)}\n`);
  return receipt;
}

export function readReceipt(tarballsDir) {
  const file = receiptPath(tarballsDir);
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return {malformed: error instanceof Error ? error.message : String(error)};
  }
}

// verifyReceipt answers "did an e2e pass over exactly these bytes, at this
// version?" — never throws, so callers decide how loud to be. The reason names the
// specific failure, since "no receipt" and "you repacked after the gate" want very
// different fixes.
export function verifyReceipt(tarballsDir, version) {
  const receipt = readReceipt(tarballsDir);
  if (!receipt) return {ok: false, reason: `no ${RECEIPT_NAME} in ${tarballsDir} — the pre-publish e2e has not run over these tarballs`};
  if (receipt.malformed) return {ok: false, reason: `${RECEIPT_NAME} is not readable JSON (${receipt.malformed})`};
  if (receipt.version !== version) {
    return {ok: false, reason: `${RECEIPT_NAME} covers version ${receipt.version}, but this tree is ${version}`};
  }

  const actual = digestTarballs(tarballsDir);
  const recorded = receipt.tarballs ?? {};
  const missing = Object.keys(recorded).filter((file) => !(file in actual));
  const added = Object.keys(actual).filter((file) => !(file in recorded));
  const changed = Object.keys(actual).filter((file) => file in recorded && actual[file] !== recorded[file]);
  if (missing.length || added.length || changed.length) {
    const parts = [];
    if (changed.length) parts.push(`${changed.length} repacked (${changed[0]}…)`);
    if (added.length) parts.push(`${added.length} not covered (${added[0]}…)`);
    if (missing.length) parts.push(`${missing.length} gone since the run (${missing[0]}…)`);
    return {ok: false, reason: `tarballs/ no longer matches the e2e receipt: ${parts.join(', ')}`, receipt};
  }
  if (Object.keys(actual).length === 0) return {ok: false, reason: `no tarballs to publish in ${tarballsDir}`};
  return {ok: true, receipt};
}

// The one escape hatch, for the first-publish bootstrap and genuine emergencies.
export const receiptOptOut = (args = []) => args.includes('--no-receipt') || process.env.MION_ALLOW_UNVERIFIED_PUBLISH === '1';

// describeReceipt is the one-line summary a publish prints, so the operator sees
// WHAT passed rather than just that something did.
export const describeReceipt = (receipt) =>
  `e2e receipt: ${receipt.version} on ${receipt.backend}/${receipt.platform} at ${receipt.at} (${Object.entries(receipt.covered ?? {})
    .filter(([, ran]) => ran)
    .map(([half]) => half)
    .join(' + ') || 'nothing recorded'}), ${Object.keys(receipt.tarballs ?? {}).length} tarballs`;
