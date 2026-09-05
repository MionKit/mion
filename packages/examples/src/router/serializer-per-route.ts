import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

interface Measurement {
  sensorId: string;
  samples: number[];
}

export const routes = {
  // JSON serialization (the router default)
  echoAsJson: mion.route((ctx, data: Measurement): Measurement => data),

  // Binary serialization, for this route only
  echoAsBinary: mion.route((ctx, data: Measurement): Measurement => data, {
    serializer: 'binary',
  }),
} satisfies Routes;
