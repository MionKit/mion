// The Turbopack loader. It owns no resolver and runs no buildStart: it connects
// to the broker (see ./broker.ts), hands over one file, and returns the rewrite.
//
// Turbopack executes webpack-style loaders through `loader-runner` inside a pool
// of Node worker processes. The parts of that API this uses were all verified
// against a real Next 16.3 build: `this.async`, `this.getOptions`,
// `this.addDependency`, `this.emitWarning`, and source maps via the async
// callback's third argument. (`this.emitFile` and `this._compiler` are NOT
// available under Turbopack; nothing here needs them.)
import net from 'node:net';
import {createLineReader, type BrokerReply, type BrokerRequest} from './wire.ts';

// Loader options cross the Turbopack boundary as plain JSON, so this is the
// whole contract: a socket path. Everything else was already decided by the
// broker in the next.config process.
interface LoaderOptions {
  socketPath: string;
}

// LoaderContext is the slice of the webpack loader API this file touches. Typed
// structurally so the package takes no dependency on webpack's types just to
// describe five members.
interface LoaderContext {
  async: () => (error: Error | null, code?: string, map?: unknown) => void;
  getOptions: () => LoaderOptions;
  resourcePath: string;
  addDependency?: (file: string) => void;
  emitWarning?: (warning: Error) => void;
}

// One connection per worker process, shared by every file that worker handles.
let connection: Promise<net.Socket> | null = null;
let sequence = 0;
const pending = new Map<number, (reply: BrokerReply) => void>();

function connect(socketPath: string): Promise<net.Socket> {
  if (connection) return connection;
  connection = new Promise<net.Socket>((resolve, reject) => {
    const socket = net.connect(socketPath, () => resolve(socket));
    socket.once('error', (error) => {
      // A connection that never came up must not leave every later file waiting
      // on a promise that can no longer settle.
      connection = null;
      for (const settle of pending.values()) settle({id: -1, ok: false, error: String(error)});
      pending.clear();
      reject(error);
    });
    socket.on(
      'data',
      createLineReader((line) => {
        let reply: BrokerReply;
        try {
          reply = JSON.parse(line) as BrokerReply;
        } catch {
          return;
        }
        const settle = pending.get(reply.id);
        if (!settle) return;
        pending.delete(reply.id);
        settle(reply);
      })
    );
  });
  return connection;
}

export default function runTypesNextLoader(this: LoaderContext, source: string): void {
  const callback = this.async();
  const {socketPath} = this.getOptions();
  const file = this.resourcePath;
  const emitWarning = this.emitWarning?.bind(this);
  const addDependency = this.addDependency?.bind(this);

  void (async () => {
    const socket = await connect(socketPath);
    const id = ++sequence;
    const request: BrokerRequest = {id, file, code: source};
    const reply = await new Promise<BrokerReply>((resolve) => {
      pending.set(id, resolve);
      socket.write(`${JSON.stringify(request)}\n`);
    });

    for (const warning of reply.warnings ?? []) emitWarning?.(new Error(warning));
    if (!reply.ok) throw new Error(reply.error ?? 'mion broker failed');
    // Declaring these is what makes a type edit in ANOTHER file re-run this one;
    // without them Turbopack would happily serve a cached, stale rewrite.
    //
    // typeDeps names the exact files whose types this rewrite depends on. The
    // stamp is the coarse fallback — one path every rewritten file declares, so
    // ANY type change re-runs ALL of them. Declare BOTH: an empty typeDeps means
    // "unknown" (a type the resolver could not attribute), not "no
    // dependencies", and the stamp is what keeps that case correct rather than
    // silently stale. Declaring both costs one extra dependency edge per file.
    for (const dep of reply.typeDeps ?? []) addDependency?.(dep);
    if (reply.stamp && addDependency) addDependency(reply.stamp);
    // No rewrite for this file: hand back the original source untouched.
    if (typeof reply.code !== 'string') return callback(null, source);
    callback(null, reply.code, reply.map);
  })().catch((error: unknown) => {
    callback(error instanceof Error ? error : new Error(String(error)));
  });
}
