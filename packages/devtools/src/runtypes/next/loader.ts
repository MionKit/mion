// The Turbopack loader: it owns no resolver and runs no buildStart, it hands one file to the broker
// (./broker.ts) and returns the rewrite. Turbopack runs webpack-style loaders through `loader-runner` in a
// pool of Node workers, which carries only part of that API: the members used here were verified against a
// real Next 16.3 build, while `this.emitFile` and `this._compiler` are NOT available under Turbopack.
import net from 'node:net';
import {createLineReader, type BrokerReply, type BrokerRequest} from './wire.ts';

// Options cross the Turbopack boundary as plain JSON; everything else the broker already decided in next.config.
interface LoaderOptions {
  socketPath: string;
}

// The slice of the webpack loader API this file touches, typed structurally so the package needs no webpack types.
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
      // A connection that never came up must not leave every later file waiting on a promise that cannot settle.
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
    // Declaring these is what makes a type edit in ANOTHER file re-run this one, instead of Turbopack serving a
    // stale cached rewrite. Declare BOTH: typeDeps names the exact files, and the stamp (one path every rewritten
    // file declares, so ANY type change re-runs ALL of them) covers an empty typeDeps, which means "unknown".
    for (const dep of reply.typeDeps ?? []) addDependency?.(dep);
    if (reply.stamp && addDependency) addDependency(reply.stamp);
    // No rewrite for this file.
    if (typeof reply.code !== 'string') return callback(null, source);
    callback(null, reply.code, reply.map);
  })().catch((error: unknown) => {
    callback(error instanceof Error ? error : new Error(String(error)));
  });
}
