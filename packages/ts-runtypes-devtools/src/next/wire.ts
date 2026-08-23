// The broker <-> loader wire. Deliberately tiny and independent of the resolver
// protocol: the loader never speaks to the Go resolver, it only asks the broker
// to rewrite one file.
//
// Framing is one JSON object per line, same as the resolver wire. Unlike that
// wire (which is strictly FIFO and carries no ids) this one IS multiplexed —
// several Turbopack loader workers share one broker connection each, and a
// worker may have more than one file in flight — so every request carries an id
// the reply echoes back.

/** One file's rewrite request. `code` is the source Turbopack handed the loader. */
export interface BrokerRequest {
  id: number;
  file: string;
  code: string;
}

export interface BrokerReply {
  id: number;
  ok: boolean;
  // Absent when the resolver had no rewrite for this file (the loader then
  // hands Turbopack the original source back untouched).
  code?: string;
  map?: unknown;
  // Warning-severity diagnostics collected while rewriting THIS file, so the
  // loader can re-emit them through `this.emitWarning` and Turbopack attributes
  // them to the right module.
  warnings?: string[];
  // The invalidation stamp path (see broker.ts). The loader declares it as a
  // loader dependency so a type edit anywhere re-runs this file's rewrite.
  // Always present on a successful reply: it is the FALLBACK for an empty
  // typeDeps, which means "unknown", not "no dependencies".
  stamp?: string;
  // The source files declaring the types this file's call sites reflect.
  // Turbopack only knows the import graph, and these edges are not in it — a
  // type-only import is erased and an ambient `.d.ts` type was never imported.
  // The loader declares each one so editing a type re-runs exactly the files
  // that reflect it, instead of every marker-bearing file (the stamp's blast
  // radius). Absolute paths.
  typeDeps?: string[];
  error?: string;
}

/** Splits a socket's byte stream into whole lines, tolerating chunk boundaries. */
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
