import type {ScanFilesResult} from './resolver-client.ts';

// SiteScanner is the scan surface the rewrite needs, satisfied structurally by ResolverClient and by the batcher.
export interface SiteScanner {
  scanFiles(files: string[]): Promise<ScanFilesResult>;
}

// createScanBatcher coalesces concurrent single-file scans into one scanFiles dispatch: the resolver
// pipe is FIFO, and one batch spans several checker groups, so the binary's parallel marker scan
// engages on the transform path instead of N serial round-trips (one file = one checker group).
// The window is one macrotask (setTimeout 0): the current tick, with no perceptible latency added.
// A failed batch falls back to per-file scans, so one unscannable file fails only its own transform.
export function createScanBatcher(scan: SiteScanner['scanFiles']): SiteScanner {
  let pending: {files: string[]; promise: Promise<ScanFilesResult>} | null = null;

  function scanOne(file: string): Promise<ScanFilesResult> {
    if (!pending) {
      const files: string[] = [];
      const promise = new Promise<ScanFilesResult>((resolve, reject) => {
        setTimeout(() => {
          pending = null;
          scan(files).then(resolve, reject);
        }, 0);
      });
      pending = {files, promise};
    }
    // The same file can be requested twice in one window (SSR + client), doubling its sites.
    if (!pending.files.includes(file)) pending.files.push(file);
    return pending.promise.then(
      (result) => projectFile(result, file),
      () => scan([file]).then((result) => projectFile(result, file))
    );
  }

  return {
    scanFiles(files: string[]): Promise<ScanFilesResult> {
      // The rewrite pipeline always asks for exactly one file.
      if (files.length !== 1) return scan(files);
      return scanOne(files[0]);
    },
  };
}

// projectFile narrows a batched response to one file; the per-cache added* booleans stay batch-scoped
// (coarse invalidation signals, not per-file data). Paths arrive in two shapes: sites echo the
// REQUESTED path verbatim, pure-fn replacements carry the program's ABSOLUTE file name. Matching on a
// separator boundary keeps `a/user.ts` from claiming `another-user.ts`.
function projectFile(result: ScanFilesResult, file: string): ScanFilesResult {
  return {
    ...result,
    sites: result.sites.filter((site) => samePath(site.file, file)),
    replacements: result.replacements?.filter((replacement) => samePath(replacement.file, file)),
  };
}

function samePath(tagged: string, requested: string): boolean {
  return tagged === requested || tagged.endsWith('/' + requested) || tagged.endsWith('\\' + requested);
}
