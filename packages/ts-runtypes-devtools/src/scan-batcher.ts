import type {ScanFilesResult} from './resolver-client.ts';

// SiteScanner is the minimal scan surface the rewrite pipeline needs —
// satisfied structurally by ResolverClient and by the batcher below.
export interface SiteScanner {
  scanFiles(files: string[]): Promise<ScanFilesResult>;
}

// createScanBatcher coalesces concurrent single-file scan requests into
// one multi-file scanFiles dispatch. Vite transforms modules concurrently,
// but the resolver pipe is FIFO — N marker files transformed in the same
// tick used to serialize into N single-file round-trips, each taking the
// Go side's serial scan path (one file = one checker group). One batched
// dispatch amortizes the per-request overhead AND spans multiple checker
// groups, so the binary's parallel marker scan engages on the transform
// path, not just the bulk dump.
//
// Batching window: one macrotask (setTimeout 0) — wide enough to collect
// every transform issued in the current tick, narrow enough to add no
// perceptible latency. Each member's result is projected back down to its
// own file (sites and replacements are file-tagged). A failed batch falls
// back to per-file scans so one unscannable file reproduces today's
// behavior — its own transform fails, its neighbours' don't.
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
    // The same file can be requested twice in one window (e.g. SSR +
    // client transforms); scanning it twice would double its sites in
    // the flat response, so each batch carries each file once.
    if (!pending.files.includes(file)) pending.files.push(file);
    return pending.promise.then(
      (result) => projectFile(result, file),
      () => scan([file]).then((result) => projectFile(result, file))
    );
  }

  return {
    scanFiles(files: string[]): Promise<ScanFilesResult> {
      // The rewrite pipeline always asks for exactly one file; anything
      // else is passed through unbatched.
      if (files.length !== 1) return scan(files);
      return scanOne(files[0]);
    },
  };
}

// projectFile narrows a batched response down to one member file. Sites
// and replacements are file-tagged; the per-cache added* booleans stay
// batch-scoped (they are coarse invalidation signals, not per-file data).
//
// Path comparison must tolerate the wire's two shapes: sites echo the
// REQUESTED path verbatim, but pure-fn replacements carry the program's
// ABSOLUTE file name (the extractor records source positions against the
// tsgo program, which always holds absolute paths in tsconfig mode).
// Matching on a separator boundary keeps `a/user.ts` from claiming
// `another-user.ts`.
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
