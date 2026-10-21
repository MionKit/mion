import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter({basePath: 'api'});

interface Measurement {
  sensorId: string;
  samples: number[];
}

// a preset shared by several routes, `as const` so the build reads it like an inline literal
const compactRoute = {
  parser: 'compact',
  description: 'positional wire',
} as const;

export const routes = {
  // the router default: clone on both directions
  echo: mion.route((ctx, data: Measurement): Measurement => data),

  // compact on both directions, for this route only
  echoCompact: mion.route((ctx, data: Measurement): Measurement => data, {
    parser: 'compact',
  }),

  // only the return changes; the params keep the router default
  echoMutate: mion.route((ctx, data: Measurement): Measurement => data, {
    parser: {return: 'mutate'},
  }),

  // refuse a request carrying a property Measurement does not declare
  echoStrict: mion.route((ctx, data: Measurement): Measurement => data, {
    parser: {params: 'mutateStrict'},
  }),

  // the shared preset
  echoPreset: mion.route(
    (ctx, data: Measurement): Measurement => data,
    compactRoute
  ),

  // middleware takes the same option: its params and return use the same wires
  stamp: mion.middleware(
    (ctx, tag: string): {tag: string; at: Date} => ({tag, at: new Date()}),
    {parser: 'compact'}
  ),
} satisfies Routes;
