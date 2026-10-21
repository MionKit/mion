import {startNodeServer} from '@mionjs/platform-node';
import type {Server} from 'node:http';
// the routes module: importing it registers the router
import '../http/node-routes.ts';

let server: Server | undefined;

export async function setup() {
  // resolves once the socket is listening, so nothing is spawned and no port is polled
  server = (await startNodeServer({port: 8076})) as Server;
}

export async function teardown() {
  if (server) await new Promise<void>((done) => server?.close(() => done()));
}
