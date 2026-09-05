import {Routes} from '@mionjs/router';
import {mion} from './full-example.app.ts';

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
