/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Reads node's `--trace-gc-nvp` output into the numbers a memory comparison is decided on.
//
// V8 writes ONE JSON object per collection, to STDOUT (not stderr), behind its own header:
//   [677:0x11818000:0]  102 ms: GC: {"pause":1.902,"gc":"s","promoted":688304, ...}
// Interleaved with lines that are not JSON at all ("Memory pool: Removed pages: 0"), with
// whatever the traced program prints itself, and - when the file is read while the process is
// still writing - with a truncated final line. Anything that does not parse is skipped rather
// than raised: a malformed line is expected, not a failure.
//
// Pure module, no side effects: packages/devtools/test/gc-trace.test.ts imports it directly.

/** V8's code for a young-generation collection. Every other code it reports is a major one. */
const SCAVENGE = 's';

const round = (value, places = 2) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

/** Every collection record in a chunk of trace output, in the order V8 wrote them. */
export function parseGcTrace(text) {
  const entries = [];
  for (const line of text.split('\n')) {
    const jsonStart = line.indexOf('{');
    if (jsonStart === -1) continue;
    let entry;
    try {
      entry = JSON.parse(line.slice(jsonStart));
    } catch {
      continue;
    }
    // A line of the program's own output can be valid JSON, so the shape is what identifies a
    // collection record, never the fact that it parsed.
    if (typeof entry.gc !== 'string' || typeof entry.pause !== 'number') continue;
    entries.push(entry);
  }
  return entries;
}

/**
 * The per-request memory metrics, which is what makes a short run usable: bytes promoted per
 * request is a ratio, so the run-to-run drift that makes requests-per-second unusable over a
 * short window cancels out of it. `requestsTotal` is wrk's own count for the measured window.
 * `promoted` is only reported on a scavenge, so majors never contribute to it.
 */
export function summarizeGcTrace(entries, requestsTotal) {
  let promotedBytes = 0;
  let pauseMs = 0;
  let scavenges = 0;
  let majors = 0;
  let peakHeapUsed = 0;
  for (const entry of entries) {
    pauseMs += entry.pause;
    peakHeapUsed = Math.max(peakHeapUsed, entry.start_object_size ?? 0, entry.end_object_size ?? 0);
    if (entry.gc === SCAVENGE) {
      scavenges++;
      promotedBytes += entry.promoted ?? 0;
    } else {
      majors++;
    }
  }
  // A window with no requests would divide by zero; report the totals and leave the ratios null
  // rather than emitting Infinity into a result file the aggregator reads.
  const perRequest = requestsTotal > 0;
  return {
    promotedBytes,
    scavenges,
    majors,
    gcPauseMs: round(pauseMs),
    peakHeapUsed,
    promotedPerReq: perRequest ? round(promotedBytes / requestsTotal) : null,
    majorsPerKReq: perRequest ? round((majors / requestsTotal) * 1000, 3) : null,
    gcPauseMsPerReq: perRequest ? round(pauseMs / requestsTotal, 4) : null,
  };
}

/** Peak resident memory of a process, the kernel's own high-water mark in bytes. Exact where
 *  sampling RSS on a timer only catches whatever the ticks happened to land on, and it reads the
 *  same on every runtime, which is what lets the bun lane be compared at all. Null off Linux, or
 *  once the process is gone. */
export function readPeakRss(pid, readFile) {
  let status;
  try {
    status = readFile(`/proc/${pid}/status`);
  } catch {
    return null;
  }
  const match = /^VmHWM:\s+(\d+)\s+kB$/m.exec(status);
  return match ? Number(match[1]) * 1024 : null;
}
