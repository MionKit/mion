import {route, Routes} from '@mionjs/router';

interface Measurement {
  sensorId: string;
  samples: number[];
}

export const routes = {
  // JSON serialization (the router default)
  echoAsJson: route((ctx, data: Measurement): Measurement => data),

  // Binary serialization, for this route only
  echoAsBinary: route((ctx, data: Measurement): Measurement => data, {
    serializer: 'binary',
  }),
} satisfies Routes;
