/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Every server under test. `dir` is its isolated pnpm project under apps/, `entry`
// the file to run, `runtime` which binary runs it. The mion lanes share ONE project
// (one build, three entry points) because they differ only in platform adapter.
//
// `description` and `validation` are what the docs table prints, so they live beside
// the app rather than in the website content - a lane that changes what it does
// updates its own row.

export const APPS = [
  {
    name: 'mion',
    label: 'mion',
    family: 'mion',
    dir: 'mion',
    entry: 'dist/server-node.mjs',
    runtime: 'node',
    router: true,
    validation: true,
    versionOf: '@mionjs/router',
    description: 'Automatic validation and serialization out of the box',
  },
  {
    name: 'mion.uws',
    label: 'mion.uws',
    family: 'mion',
    dir: 'mion',
    entry: 'dist/server-uws.mjs',
    runtime: 'node',
    router: true,
    validation: true,
    versionOf: '@mionjs/platform-uws',
    description: 'mion on uWebSockets.js, automatic validation and serialization',
  },
  {
    name: 'mion.bun',
    label: 'mion.bun',
    family: 'mion',
    dir: 'mion',
    entry: 'dist/server-bun.mjs',
    runtime: 'bun',
    router: true,
    validation: true,
    versionOf: '@mionjs/platform-bun',
    description: 'mion using bun, automatic validation and serialization',
  },
  {
    name: 'http-node',
    label: 'http-node',
    family: 'node',
    dir: 'http-node',
    entry: 'server.mjs',
    runtime: 'node',
    router: false,
    validation: true,
    versionOf: 'node',
    description: 'Bare node http server with Zod validation (no router)',
  },
  {
    name: 'fastify',
    label: 'fastify',
    family: 'node',
    dir: 'fastify',
    entry: 'server.mjs',
    runtime: 'node',
    router: true,
    validation: true,
    versionOf: 'fastify',
    description: 'Fastify with native JSON Schema validation',
  },
  {
    name: 'express',
    label: 'express',
    family: 'node',
    dir: 'express',
    entry: 'server.mjs',
    runtime: 'node',
    router: true,
    validation: true,
    versionOf: 'express',
    description: 'Express with Zod validation',
  },
  {
    name: 'hapi',
    label: 'hapi',
    family: 'node',
    dir: 'hapi',
    entry: 'server.mjs',
    runtime: 'node',
    router: true,
    validation: true,
    versionOf: '@hapi/hapi',
    description: 'Hapi with Zod validation',
  },
  {
    name: 'hono',
    label: 'hono',
    family: 'node',
    dir: 'hono',
    entry: 'server-node.mjs',
    runtime: 'node',
    router: true,
    validation: true,
    versionOf: 'hono',
    description: 'hono node server with Zod validation',
  },
  {
    name: 'hono.bun',
    label: 'hono.bun',
    family: 'bun',
    dir: 'hono',
    entry: 'server-bun.mjs',
    runtime: 'bun',
    router: true,
    validation: true,
    versionOf: 'hono',
    description: 'hono bun server with Zod validation',
  },
  {
    name: 'elysia.bun',
    label: 'elysia.bun',
    family: 'bun',
    dir: 'elysia',
    entry: 'server-bun.mjs',
    runtime: 'bun',
    router: true,
    validation: true,
    versionOf: 'elysia',
    description: 'Elysia framework with TypeBox validation',
  },
];

export const APP_NAMES = APPS.map((app) => app.name);
export const findApp = (name) => APPS.find((app) => app.name === name);
