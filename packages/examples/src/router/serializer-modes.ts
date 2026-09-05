import {createMionRouter, Routes} from '@mionjs/router';

type Reading = {sensorId: string; samples: number[]; takenAt: Date};

// start-default
// No option: the client sends its params as a JSON string (direct) and the server prepares its return
// value in place (mutate) for the platform to stringify. The fastest wire for the common case.
export const defaultMion = createMionRouter();
// end-default

// start-router-default
// A router-wide default. Every route and middleware function declared through this router compiles the
// compact pair: objects ride as positional arrays, without key names, in both directions.
export const compactMion = createMionRouter({serializer: 'compact'});
// end-router-default

// start-per-direction
// One strategy per direction: `params` is what the client sends, `return` what the server answers.
export const mixedMion = createMionRouter({
  serializer: {params: 'direct', return: 'clone'},
});
// end-per-direction

// start-per-route
const mion = createMionRouter();

export const routes = {
  // the router default
  listReadings: mion.route((ctx): Reading[] => []),
  // this route only: the smallest JSON, both ways
  syncReadings: mion.route(
    (ctx, readings: Reading[]): number => readings.length,
    {serializer: 'compact'}
  ),
  // this route only: a binary wire, with the JSON pair kept beside it for the first plain JSON call
  streamReadings: mion.route((ctx, sensorId: string): Reading[] => [], {
    serializer: 'binary',
  }),
  // a direction at a time: binary params in, a self written JSON string out
  uploadReading: mion.route(
    (ctx, reading: Reading): string => reading.sensorId,
    {
      serializer: {params: 'binary', return: 'direct'},
    }
  ),
} satisfies Routes;
// end-per-route

// start-preset
// The build reads the option, so it must be a literal: inline, or a shared preset declared `as const`.
export const COMPACT = {serializer: 'compact'} as const;

export const presetRoutes = {
  readings: mion.route((ctx): Reading[] => [], COMPACT),
} satisfies Routes;
// end-preset
