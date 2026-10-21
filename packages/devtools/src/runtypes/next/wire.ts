// The broker <-> loader wire: the loader never speaks to the Go resolver, it only asks the broker to rewrite
// one file. One JSON object per line, like the resolver wire, but multiplexed (workers share a connection and
// one worker may have several files in flight), so every request carries an id the reply echoes back.

/** `code` is the source Turbopack handed the loader. */
export interface BrokerRequest {
  id: number;
  file: string;
  code: string;
}

export interface BrokerReply {
  id: number;
  ok: boolean;
  // Absent when the resolver had no rewrite; the loader then hands Turbopack the original source back.
  code?: string;
  map?: unknown;
  // Warnings from rewriting THIS file, re-emitted by the loader so Turbopack attributes them to the right module.
  warnings?: string[];
  // The invalidation stamp path (see broker.ts), declared as a loader dependency so a type edit anywhere re-runs
  // this file. Always present on success: it is the FALLBACK for an empty typeDeps, which means "unknown".
  stamp?: string;
  // Absolute paths of the files declaring the types this file's call sites reflect. Not in Turbopack's import
  // graph: a type-only import is erased and an ambient `.d.ts` type was never imported. Declared by the loader
  // so editing a type re-runs exactly the files reflecting it, not every marker-bearing file.
  typeDeps?: string[];
  error?: string;
}

export function createLineReader(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let buffer = '';
  return (chunk) => {
    buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    let newline = buffer.indexOf('\n');
    while (newline !== -1) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      if (line) onLine(line);
      newline = buffer.indexOf('\n');
    }
  };
}
