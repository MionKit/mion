import {setSerializationOptions} from '@mionjs/run-types';

setSerializationOptions({
  defaultBufferSize: 4096, // first buffer size when a type has no size history yet
  sizeMultiplier: 3, // more room above the average size before the buffer has to grow
});
