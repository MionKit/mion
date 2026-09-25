import {createJsonEncoderFn} from '@mionjs/run-types';

// start-types
interface Meetup {
  id: bigint;
  startsAt: Date;
  guests: Map<string, number>;
  tags: Set<string>;
  slot: [string, string?];
  note?: string;
}

const encodeMeetup = createJsonEncoderFn<Meetup>();

encodeMeetup({
  id: 42n,
  startsAt: new Date('2024-05-01T10:00:00.000Z'),
  guests: new Map([['ana', 2]]),
  tags: new Set(['work']),
  slot: ['am', undefined],
});
// {"id":"42","startsAt":"2024-05-01T10:00:00.000Z","guests":[["ana",2]],"tags":["work"],"slot":["am",null]}
// end-types

// start-unions
interface Setting {
  level: number | null; // every member is plain JSON
  expires: Date | string; // Date is not plain JSON
}

const encodeSetting = createJsonEncoderFn<Setting>();

encodeSetting({level: null, expires: new Date('2024-05-01T10:00:00.000Z')});
// {"level":null,"expires":[1,"2024-05-01T10:00:00.000Z"]}

encodeSetting({level: 3, expires: 'never'});
// {"level":3,"expires":[0,"never"]}
// end-unions
