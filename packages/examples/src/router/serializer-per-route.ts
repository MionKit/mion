import {createMionRouter, Routes} from '@mionjs/router';

const mion = createMionRouter();

interface Measurement {
  sensorId: string;
  samples: number[];
}

export const routes = {
  // the router default: a JSON string in, a value prepared in place out
  echoAsJson: mion.route((ctx, data: Measurement): Measurement => data),

  // Binary serialization, for this route only
  echoAsBinary: mion.route((ctx, data: Measurement): Measurement => data, {
    serializer: 'binary',
  }),
} satisfies Routes;
