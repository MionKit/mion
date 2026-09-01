// The type-dependency index (src/type-deps.ts): the reverse map that answers
// "which already-transformed files now serve a validator for a type that just
// changed?" — the question no bundler can answer on its own, because the edge
// from a using file to its type file is erased or never existed.
import {describe, expect, it} from 'vitest';
import path from 'node:path';
import {createTypeDepsIndex, depKey} from '../src/core/type-deps.ts';

const CWD = path.resolve('/project');
const abs = (rel: string) => depKey(rel, CWD);

describe('createTypeDepsIndex', () => {
  it('maps a type file back to the site files reflecting it', () => {
    const index = createTypeDepsIndex(CWD);
    index.record('src/uses.ts', [abs('src/models.ts')]);
    index.record('src/other.ts', [abs('src/models.ts'), abs('src/extra.ts')]);
    index.record('src/unrelated.ts', [abs('src/nothing.ts')]);

    expect(index.affectedSiteFiles([abs('src/models.ts')])).toEqual([abs('src/other.ts'), abs('src/uses.ts')]);
    expect(index.affectedSiteFiles([abs('src/extra.ts')])).toEqual([abs('src/other.ts')]);
    expect(index.affectedSiteFiles([abs('src/never-seen.ts')])).toEqual([]);
  });

  it('accepts relative and absolute paths interchangeably', () => {
    // The resolver reports absolute program paths, Vite reports absolute ids,
    // and the plugin's own bookkeeping is cwd-relative — a lookup has to match
    // across all three or the index silently never fires.
    const index = createTypeDepsIndex(CWD);
    index.record('src/uses.ts', ['src/models.ts']);
    expect(index.affectedSiteFiles([abs('src/models.ts')])).toEqual([abs('src/uses.ts')]);
    expect(index.affectedSiteFiles(['src/models.ts'])).toEqual([abs('src/uses.ts')]);
  });

  it('replaces a previous record instead of accumulating', () => {
    // A type the file no longer reflects must stop invalidating it, or an edit
    // to a since-removed dependency re-transforms the file forever.
    const index = createTypeDepsIndex(CWD);
    index.record('src/uses.ts', [abs('src/old.ts')]);
    index.record('src/uses.ts', [abs('src/new.ts')]);

    expect(index.affectedSiteFiles([abs('src/old.ts')])).toEqual([]);
    expect(index.affectedSiteFiles([abs('src/new.ts')])).toEqual([abs('src/uses.ts')]);
  });

  it('reports a file with no deps as unknown, not as dependency-free', () => {
    // This is the whole safety story: empty means the resolver told us nothing,
    // so the file joins the coarse fallback set rather than being assumed safe.
    const index = createTypeDepsIndex(CWD);
    index.record('src/known.ts', [abs('src/models.ts')]);
    index.record('src/unknown.ts', undefined);
    index.record('src/empty.ts', []);

    expect(index.unknownSiteFiles()).toEqual([abs('src/empty.ts'), abs('src/unknown.ts')]);
    expect(index.knownSiteFiles()).toEqual([abs('src/empty.ts'), abs('src/known.ts'), abs('src/unknown.ts')]);
  });

  it('forgets a site file completely', () => {
    const index = createTypeDepsIndex(CWD);
    index.record('src/uses.ts', [abs('src/models.ts')]);
    index.forget('src/uses.ts');

    expect(index.affectedSiteFiles([abs('src/models.ts')])).toEqual([]);
    expect(index.knownSiteFiles()).toEqual([]);
  });

  it('deduplicates site files reached through several changed type files', () => {
    const index = createTypeDepsIndex(CWD);
    index.record('src/uses.ts', [abs('src/a.ts'), abs('src/b.ts')]);
    expect(index.affectedSiteFiles([abs('src/a.ts'), abs('src/b.ts')])).toEqual([abs('src/uses.ts')]);
  });
});
