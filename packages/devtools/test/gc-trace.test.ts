// The `--trace-gc-nvp` reader behind `bench servers gcprobe`
// (container/mion-bench/harness/gc-trace.mjs). What it has to survive is the shape of real
// trace output: V8's own header before the JSON, non-JSON lines interleaved, the traced
// program's own stdout mixed in, and a truncated final line when the file is read while the
// process is still writing to it.
import {describe, expect, it} from 'vitest';
// Plain ESM dev script, no types: one directive per import line, so the formatter can never
// wrap the import away from the line the error lands on.
// @ts-expect-error untyped .mjs
import {parseGcTrace, readPeakRss, summarizeGcTrace} from '../../../container/mion-bench/harness/gc-trace.mjs';

/** A scavenge line as node 26 writes it, trimmed to the keys the summary reads. */
const scavenge = (fields: Record<string, unknown>, atMs = 102) =>
  `[677:0x11818000:0]      ${atMs} ms: GC: ${JSON.stringify({pause: 1.9, gc: 's', promoted: 0, ...fields})}`;

const major = (fields: Record<string, unknown>, atMs = 204) =>
  `[677:0x11818000:0]      ${atMs} ms: GC: ${JSON.stringify({pause: 12.5, gc: 'mc', ...fields})}`;

describe('parseGcTrace', () => {
  it('reads a collection record out of V8s header-prefixed line', () => {
    const entries = parseGcTrace(scavenge({promoted: 688304, start_object_size: 4974512}));
    expect(entries).toHaveLength(1);
    expect(entries[0].promoted).toBe(688304);
    expect(entries[0].gc).toBe('s');
  });

  it('skips the non-JSON lines V8 interleaves', () => {
    const text = [
      '[677:0x11818000:0]       99 ms: Memory pool: Removed pages: 0, removed large pages: 0',
      ', removed zone reservations: 0',
      scavenge({promoted: 100}),
    ].join('\n');
    expect(parseGcTrace(text)).toHaveLength(1);
  });

  it('skips the traced programs own output, including a line that is valid JSON', () => {
    const text = [
      'mion node server running on http://localhost:3000',
      '{"level":"info","msg":"a log line that happens to be json"}',
      scavenge({promoted: 100}),
    ].join('\n');
    const entries = parseGcTrace(text);
    expect(entries).toHaveLength(1);
    expect(entries[0].promoted).toBe(100);
  });

  it('skips a truncated final line, which is what reading a live trace file gives', () => {
    const text = `${scavenge({promoted: 100})}\n[677:0x11818000:0]      140 ms: GC: {"pause":2.1,"gc":"s","promo`;
    expect(parseGcTrace(text)).toHaveLength(1);
  });

  it('returns nothing for empty output rather than throwing', () => {
    expect(parseGcTrace('')).toEqual([]);
  });
});

describe('summarizeGcTrace', () => {
  it('counts promoted bytes over scavenges only, and majors separately', () => {
    const entries = parseGcTrace(
      [scavenge({promoted: 1000}), scavenge({promoted: 3000}), major({start_object_size: 9_000_000})].join('\n')
    );
    const summary = summarizeGcTrace(entries, 100);
    expect(summary.promotedBytes).toBe(4000);
    expect(summary.scavenges).toBe(2);
    expect(summary.majors).toBe(1);
    expect(summary.promotedPerReq).toBe(40);
    expect(summary.majorsPerKReq).toBe(10);
  });

  it('takes the peak heap from the largest size either side of any collection', () => {
    const entries = parseGcTrace(
      [scavenge({start_object_size: 5_000_000, end_object_size: 4_000_000}), major({start_object_size: 9_000_000})].join('\n')
    );
    expect(summarizeGcTrace(entries, 10).peakHeapUsed).toBe(9_000_000);
  });

  it('sums the pauses of every collection, major and minor alike', () => {
    const entries = parseGcTrace([scavenge({pause: 1.5}), major({pause: 10})].join('\n'));
    const summary = summarizeGcTrace(entries, 1000);
    expect(summary.gcPauseMs).toBe(11.5);
    expect(summary.gcPauseMsPerReq).toBe(0.0115);
  });

  it('leaves the ratios null when no request was measured, never Infinity', () => {
    const summary = summarizeGcTrace(parseGcTrace(scavenge({promoted: 500})), 0);
    expect(summary.promotedBytes).toBe(500);
    expect(summary.promotedPerReq).toBeNull();
    expect(summary.majorsPerKReq).toBeNull();
    expect(summary.gcPauseMsPerReq).toBeNull();
  });
});

describe('readPeakRss', () => {
  const status = ['Name:\tnode', 'VmPeak:\t 1234567 kB', 'VmHWM:\t  204800 kB', 'VmRSS:\t  102400 kB'].join('\n');

  it('reads the kernels own high-water mark, in bytes', () => {
    expect(readPeakRss(1234, () => status)).toBe(204800 * 1024);
  });

  it('answers null for a process that is already gone', () => {
    expect(
      readPeakRss(1234, () => {
        throw new Error('ENOENT');
      })
    ).toBeNull();
  });

  it('answers null where the field does not exist, rather than guessing', () => {
    expect(readPeakRss(1234, () => 'Name:\tnode\nVmRSS:\t  102400 kB')).toBeNull();
  });
});
