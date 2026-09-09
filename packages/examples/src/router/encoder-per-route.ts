import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter({basePath: 'api'});

interface Measurement {
  sensorId: string;
  samples: number[];
}

// A route option shared by several routes: written `as const`, so the build reads it like an inline literal.
const compactRoute = {
  encoder: 'compact',
  description: 'positional wire',
} as const;

export const routes = {
  // the built-in default: clone on both directions
  echo: mion.route((ctx, data: Measurement): Measurement => data),

  // compact on both directions, for this route only
  echoCompact: mion.route((ctx, data: Measurement): Measurement => data, {
    encoder: 'compact',
  }),

  // only the return changes; the params keep the router default
  echoDirect: mion.route((ctx, data: Measurement): Measurement => data, {
    encoder: {return: 'direct'},
  }),

  // the shared preset
  echoPreset: mion.route(
    (ctx, data: Measurement): Measurement => data,
    compactRoute
  ),

  // middleFns take the same option: their params and return ride the same wires
  stamp: mion.middleFn(
    (ctx, tag: string): {tag: string; at: Date} => ({tag, at: new Date()}),
    {encoder: 'compact'}
  ),
} satisfies Routes;
