// The Next.js broker: ONE resolver and ONE whole-program buildStart for a whole
// `next build` / `next dev`, shared by every Turbopack loader worker.
//
// # Why a broker exists at all
//
// Turbopack has no plugin API, so the only way in is a webpack-style loader
// (`turbopack.rules`). Turbopack runs those loaders in a POOL OF NODE WORKER
// PROCESSES — four on a typical machine, ephemeral. A loader that started the
// resolver itself would therefore start FOUR resolvers and pay for four
// whole-program tsgo builds of the same project, every build.
//
// So the loader owns nothing. `next.config` runs in Node before any worker
// exists, which makes it the natural host for the real buildStart: it starts
// this broker, the broker owns the single resolver, and each worker connects
// over a socket and asks for one file at a time.
//
// # Election
//
// `next.config` is evaluated more than once (observed: twice per build, in the
// same process — once for the build and once inside a jest-worker thread), and
// nothing promises that stays true. So ownership is decided by ATOMIC SOCKET
// BIND rather than by a flag: whoever binds first owns the resolver, and every
// later caller discovers EADDRINUSE and becomes a plain client. This is the same
// guarantee a lock file gives, without the stale-lock cleanup problem.
//
// # Readiness
//
// Connections are accepted IMMEDIATELY, before buildStart finishes, and each
// request waits on a readiness promise. Attaching the handler only after
// buildStart would silently DROP any connection that arrived during startup
// (an EventEmitter discards events with no listener), and the worker would hang.
// This mirrors the gap-3 readiness gate in ../bun.ts, for the same reason.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import type {UnpluginContextMeta} from 'unplugin';
import {readEnvCompat} from '../../core/envCompat.ts';
import {unplugin, type PluginOptions} from '../../core/unplugin.ts';
import {createLineReader, type BrokerReply, type BrokerRequest} from './wire.ts';

// How long the generated-module listing may go unchecked while transforms are
// streaming through. The check is a readdir, so it is cheap, but on a large
// project it would still run once per file without a throttle.
const STAMP_THROTTLE_MS = 100;

// How long to wait for an edit to settle before absorbing it. Saving several
// files at once (a rename across a project, a formatter) should be ONE batch.
const WATCH_DEBOUNCE_MS = 30;

// MION_NEXT_DEBUG=1 traces what the broker does — election, startup, each absorbed
// edit batch, and each stamp change. The Next lane has no plugin log of its own,
// so without this a misbehaving dev loop is completely opaque.
const debugEnabled = readEnvCompat('MION_NEXT_DEBUG') === '1';
function debug(message: string): void {
  if (debugEnabled) console.error(`[@mionjs/devtools:next] ${message}`);
}

// NextOptions is the Next-lane surface: every PluginOptions knob, plus the one
// thing only this host has. It composes PluginOptions rather than extending it
// in place, so src/plugin-option-keys.ts and its parity test stay untouched.
export interface NextOptions extends PluginOptions {
  // Where the broker listens. Derived from the project root by default; set it
  // only to keep two projects that share a root from sharing one resolver.
  socketPath?: string;
}

export interface BrokerHandle {
  /** True when THIS caller won the election and owns the resolver. */
  owner: boolean;
  socketPath: string;
  /** Releases the socket and the resolver. A no-op for a non-owner. */
  close: () => Promise<void>;
}

// socketPathFor derives the endpoint for ONE Next invocation.
//
// The key includes the process id, and that is a correctness requirement rather
// than hygiene. Keying on the project root alone makes the socket a global
// rendezvous that ANY process evaluating next.config can claim — including
// Next's own detached telemetry flush, which loads the config, outlives the dev
// server, and gets reparented to init. A later `next dev` then finds a live
// socket, joins as a client, and every file comes back "source file not in
// program" from a resolver whose Program belongs to a build that ended minutes
// ago. Observed, and completely silent about the cause.
//
// Per-pid keying makes a stale owner unreachable instead of authoritative:
// worker processes never derive this path, they are handed it through the
// loader options that next.config baked in.
//
// On POSIX the path lives in the temp dir rather than the project, because a
// unix socket path is capped near 104 bytes and a deep project path spends that
// on its own. Windows has no such limit and no unix sockets by default, so it
// gets a named pipe.
export function socketPathFor(root: string, pid: number = process.pid): string {
  const digest = createHash('sha256').update(path.resolve(root)).digest('hex').slice(0, 12);
  if (process.platform === 'win32') return `\\\\.\\pipe\\mion-next-${digest}-${pid}`;
  return path.join(os.tmpdir(), `mion-next-${digest}-${pid}.sock`);
}

// ownsBroker reports whether THIS process should start a resolver at all.
// next.config is loaded by more than the process that bundles: Next's detached
// telemetry flush loads it too, and a resolver started there is pure waste (it
// never serves a loader) that also lingers after the build. Per-pid sockets
// already stop it from poisoning anything; this just stops it from existing.
export function ownsBroker(): boolean {
  return !/detached-flush|telemetry/.test(process.argv[1] ?? '');
}

/**
 * Starts (or joins) the broker for `root`. Safe to call repeatedly and from
 * several processes: exactly one wins the election and the rest no-op.
 */
export async function startBroker(root: string, options: NextOptions = {}): Promise<BrokerHandle> {
  const rootAbs = path.resolve(root);
  const socketPath = options.socketPath ?? socketPathFor(rootAbs);

  // The generated tree has to be at a path the broker KNOWS, because the
  // invalidation stamp lives inside it. Left to itself the resolver would infer
  // <srcDir>/__runtypes from the tsconfig and only echo that back internally, so
  // the Next lane pins it instead: <root>/__runtypes unless the caller said
  // otherwise. Same value goes to the resolver, so the two can never disagree.
  const genDir = options.genDir ?? '__runtypes';
  const genDirAbs = path.resolve(rootAbs, genDir);
  const stampPath = path.join(genDirAbs, 'types', '.rt-stamp');

  const server = net.createServer();
  const listening = await new Promise<boolean>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') return resolve(false);
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOENT') return resolve(false);
      reject(error);
    });
    server.listen(socketPath, () => resolve(true));
  });

  // Someone else owns it. A stale socket file from a killed build would also
  // land here, so probe it: if nothing answers, take the address over.
  if (!listening) {
    if (await isLive(socketPath)) return {owner: false, socketPath, close: async () => {}};
    await unlinkQuietly(socketPath);
    return startBroker(rootAbs, options);
  }

  const {socketPath: _socketPath, ...pluginOptions} = options;
  const rawPlugin = unplugin.raw(
    {
      ...pluginOptions,
      cwd: rootAbs,
      genDir,
      // No host gives this broker a buildEnd, so the resolver child must never
      // be the handle that keeps the Next process alive. Same reasoning as the
      // Bun runtime loader, which is what this option was added for.
      detachResolver: true,
    },
    // A real webpack host would pass its compiler and (after buildStart) the
    // framework versions; this broker calls the factory directly with no host,
    // so the cast records that the compiler-bearing meta deliberately does not
    // exist here. (Latent gap: with rollup absent from node_modules the meta
    // type collapsed to any and never enforced this.)
    {framework: 'webpack', versions: {}} as UnpluginContextMeta
  );
  // A single-plugin factory returns one plugin, but unplugin's type allows an
  // array; normalise before use, exactly as the Bun adapter does.
  const built = (Array.isArray(rawPlugin) ? rawPlugin[0] : rawPlugin) as {
    buildStart?: (this: unknown) => unknown;
    buildEnd?: (this: unknown) => unknown;
    transform?: (this: unknown, code: string, id: string) => unknown;
    rtHotUpdate?: (ctx: unknown, updates: {file: string; content?: string}[]) => Promise<void>;
  };

  // Warnings raised while rewriting one file are routed back to that file's
  // loader so Turbopack can attribute them; anything raised outside a request
  // (the whole-program buildStart) has no loader to own it and goes to stderr.
  let collecting: string[] | null = null;
  // Type dependencies for the file currently being rewritten. The shared
  // transform hook declares them through `addWatchFile` (unplugin's universal
  // shape), so the broker collects them here rather than reaching into the
  // plugin: one mechanism, every host, no Next-specific plumbing in the leaf.
  let collectingDeps: string[] | null = null;
  const context = {
    warn: (message: unknown) => {
      const text = String(message);
      if (collecting) collecting.push(text);
      else console.warn(`[@mionjs/devtools] ${text}`);
    },
    error: (message: unknown) => {
      throw new Error(String(message));
    },
    addWatchFile: (file: unknown) => {
      if (collectingDeps && typeof file === 'string') collectingDeps.push(file);
    },
  };

  let startupError: unknown;
  const ready = (async () => {
    await built.buildStart?.call(context);
  })()
    .then(() => {
      debug(`buildStart done, ${countGenerated()} generated modules`);
      refreshStamp(true);
      startWatching();
    })
    .catch((error) => {
      startupError = error;
    });

  // ── invalidation stamp ────────────────────────────────────────────────────
  // A file's rewrite depends on types declared in OTHER files, which Turbopack
  // cannot see: it only knows the imports. The resolver wire carries no per-file
  // dependency graph either (TransformResult is code/map/importBlock/edits/
  // sourceHash/emittedModules), so there is nothing precise to declare yet.
  //
  // Instead the broker tracks the generated module set. Those names are
  // content-addressed, so a changed type means a changed file name, which means
  // a changed listing. Every rewritten file declares this stamp as a loader
  // dependency, so any type change re-runs every marker-bearing file. Coarse,
  // but bounded: only files the scan found sites in are transformed at all, and
  // a transform is a couple of milliseconds.
  function countGenerated(): number {
    try {
      return fs.readdirSync(path.join(genDirAbs, 'types')).filter((name) => name.endsWith('.js')).length;
    } catch {
      return -1;
    }
  }

  let lastStamp = '';
  let lastStampAt = 0;
  function refreshStamp(force = false): void {
    const now = Date.now();
    if (!force && now - lastStampAt < STAMP_THROTTLE_MS) return;
    lastStampAt = now;
    let listing: string[];
    try {
      listing = fs.readdirSync(path.join(genDirAbs, 'types')).sort();
    } catch {
      return; // nothing generated yet
    }
    const digest = createHash('sha256').update(listing.join('\n')).digest('hex').slice(0, 16);
    if (digest === lastStamp) return;
    debug(`stamp ${lastStamp || '(none)'} -> ${digest} (${listing.length} entries)`);
    lastStamp = digest;
    try {
      fs.writeFileSync(stampPath, `${digest}\n`);
    } catch {
      // A stamp we cannot write only costs invalidation precision, never the build.
    }
  }

  // ── watching for edits ────────────────────────────────────────────────────
  // Turbopack gives a loader no update callback, so without a watcher the only
  // signal an edit happened is the loader being re-run — and by then Turbopack
  // is already resolving imports. Absorbing edits one loader call at a time
  // regenerates the module set once PER FILE, and a file resolved during one of
  // those rewrites fails with "can't resolve <hash>.js" for a module that exists
  // moments later. (Observed, not theoretical: this is what a type edit did
  // before the watcher existed.)
  //
  // So the broker watches the sources itself and absorbs a whole edit as ONE
  // batch, ahead of Turbopack re-running any loader. That is the same order
  // Vite's handleHotUpdate gets for free, via the same shared leaf.
  let watcher: fs.FSWatcher | null = null;
  const dirtyFiles = new Set<string>();
  let flushTimer: NodeJS.Timeout | null = null;
  // Serialises watcher-driven updates against transform requests: a transform
  // must never read a half-regenerated tree.
  let hotUpdate: Promise<void> = Promise.resolve();

  function scheduleFlush(): void {
    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(flushDirty, WATCH_DEBOUNCE_MS);
    flushTimer.unref?.();
  }

  function flushDirty(): void {
    if (dirtyFiles.size === 0) return;
    const batch = [...dirtyFiles];
    dirtyFiles.clear();
    const work = async () => {
      await ready;
      const read = await Promise.all(
        batch.map(async (file) => ({file, content: await fs.promises.readFile(file, 'utf8').catch(() => undefined)}))
      );
      const updates = read.filter((update) => update.content !== undefined);
      if (updates.length === 0) return;
      debug(`absorbing ${updates.length} edited file(s): ${updates.map((u) => path.relative(rootAbs, u.file)).join(', ')}`);
      await built.rtHotUpdate?.(context, updates);
      debug(`generated modules now: ${countGenerated()}`);
      refreshStamp(true);
    };
    hotUpdate = hotUpdate.then(work).catch(() => {
      // A failed absorb must not wedge the dev loop; the next edit retries.
    });
  }

  function startWatching(): void {
    if (watcher) return;
    try {
      watcher = fs.watch(rootAbs, {recursive: true}, (_event, name) => {
        if (!name) return;
        const file = path.join(rootAbs, name.toString());
        // Ignore our own output and anything that cannot carry a marker site.
        if (file.startsWith(genDirAbs)) return;
        if (file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}.next${path.sep}`)) return;
        if (!/\.[mc]?[jt]sx?$/.test(file)) return;
        debug(`watch: ${path.relative(rootAbs, file)}`);
        dirtyFiles.add(file);
        scheduleFlush();
      });
      watcher.unref?.();
    } catch {
      // Recursive watch is unsupported on some platforms/filesystems. The dev
      // loop then degrades to per-file absorption rather than failing outright.
    }
  }

  // The resolver answers strictly FIFO and carries no request ids, so requests
  // from every connected worker are funnelled through one chain. Transforms are
  // ~2ms, so serialising them costs far less than the duplicated startup would.
  let chain: Promise<void> = Promise.resolve();

  server.on('connection', (socket) => {
    socket.on('error', () => {});
    socket.on(
      'data',
      createLineReader((line) => {
        let request: BrokerRequest;
        try {
          request = JSON.parse(line) as BrokerRequest;
        } catch {
          return;
        }
        chain = chain.then(() => handle(request, socket));
      })
    );
  });

  async function handle(request: BrokerRequest, socket: net.Socket): Promise<void> {
    const warnings: string[] = [];
    let reply: BrokerReply;
    try {
      await ready;
      if (startupError) throw startupError;
      // Never rewrite against a tree a watcher-driven regenerate is mid-way
      // through writing.
      await hotUpdate;
      collecting = warnings;
      const deps: string[] = [];
      collectingDeps = deps;
      const result = (await built.transform?.call(context, request.code, request.file)) as
        | {code?: string; map?: unknown}
        | null
        | undefined;
      collecting = null;
      collectingDeps = null;
      // Forced: a transform may have just added or pruned generated modules,
      // and the reply below hands the loader this stamp as its invalidation
      // dependency — it must reflect THIS transform's output. The throttle
      // exists for the fs-watcher path; on a fast machine two back-to-back
      // transforms land inside the window and the second reply pointed at a
      // stale stamp (caught by the "moves the invalidation stamp" test).
      refreshStamp(true);
      reply = {
        id: request.id,
        ok: true,
        ...(result && typeof result.code === 'string' ? {code: result.code, map: result.map} : {}),
        ...(warnings.length ? {warnings} : {}),
        ...(deps.length ? {typeDeps: [...new Set(deps)].sort()} : {}),
        // The stamp still rides along, ALWAYS. It is the fallback for the case
        // typeDeps is empty — which means "unknown", not "no dependencies" (a
        // file whose types the resolver could not attribute, or an older
        // resolver). Dropping it there would turn a coarse invalidation into a
        // silently stale rewrite. See src/next/CLAUDE.md invariant 7.
        stamp: stampPath,
      };
    } catch (error) {
      collecting = null;
      collectingDeps = null;
      reply = {
        id: request.id,
        ok: false,
        error: String((error as Error)?.stack ?? error),
        ...(warnings.length ? {warnings} : {}),
      };
    }
    if (!socket.destroyed) socket.write(`${JSON.stringify(reply)}\n`);
  }

  // The broker lives inside the Next process, so it must never be the reason
  // that process stays alive; there is deliberately no idle timeout, because
  // closing the resolver mid-session would just make the next edit pay for a
  // cold start again.
  server.unref();
  // A socket file left in the temp dir is inert (per-pid keying means nothing
  // will ever dial it again) but still litter, so clear it on the way out.
  const cleanup = () => {
    try {
      if (process.platform !== 'win32') fs.unlinkSync(socketPath);
    } catch {
      // already gone
    }
  };
  process.once('exit', cleanup);

  return {
    owner: true,
    socketPath,
    close: async () => {
      watcher?.close();
      if (flushTimer) clearTimeout(flushTimer);
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await unlinkQuietly(socketPath);
      built.buildEnd?.call(context);
    },
  };
}

// isLive distinguishes a broker that is actually serving from a socket file
// left behind by a killed build.
function isLive(socketPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = net.connect(socketPath);
    const settle = (live: boolean) => {
      probe.destroy();
      resolve(live);
    };
    probe.once('connect', () => settle(true));
    probe.once('error', () => settle(false));
  });
}

async function unlinkQuietly(target: string): Promise<void> {
  if (process.platform === 'win32') return; // named pipes are not files
  try {
    await fs.promises.unlink(target);
  } catch {
    // already gone
  }
}
